package com.nforceone.sync.project;

import com.nforceone.sync.eod.BenchModePolicy;
import com.nforceone.sync.eod.DailyLogCategoryService;
import com.nforceone.sync.project.dto.TaskCategoryDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.context.SecurityContextHolder;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/task-categories")
public class TaskCategoryController {

    private final TaskCategoryRepository categoryRepository;
    private final DailyLogCategoryService dailyLogCategoryService;

    public TaskCategoryController(TaskCategoryRepository categoryRepository,
                                  DailyLogCategoryService dailyLogCategoryService) {
        this.categoryRepository = categoryRepository;
        this.dailyLogCategoryService = dailyLogCategoryService;
    }

    // ── Public list (dropdown use) ─────────────────────────────────────────────

    // V110: scope param selects EMPLOYEE (Submit EOD) or MANAGEMENT (Daily Log).
    // Default is EMPLOYEE so all existing Submit EOD calls never receive MANAGEMENT categories.
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<TaskCategoryDto> listActive(
            @RequestParam(name = "scope", defaultValue = "EMPLOYEE") String scope) {
        // BENCH is deliberately not selectable here: a client must not choose its own Daily Log scope.
        // The Daily Log dropdown uses /daily-log below, where the backend decides from the caller and date.
        if (BenchModePolicy.SCOPE_BENCH.equals(scope)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bench Log categories are served by GET /api/task-categories/daily-log");
        }
        validateScope(scope);
        return categoryRepository.findByScopeAndActiveTrueOrderByNameAsc(scope)
                .stream()
                .map(TaskCategoryDto::from)
                .toList();
    }

    /**
     * Categories for the Daily Log dropdown, chosen by the backend for the caller and entry date: Bench Log
     * categories for an employee with no active project allocation on that date, the Daily Log (MANAGEMENT)
     * categories for everyone else. Authenticated users only, via the security filter chain — no role check
     * is needed because the answer is always about the caller. {@code date} defaults to today.
     */
    @GetMapping("/daily-log")
    public List<TaskCategoryDto> listForDailyLog(
            @RequestParam(name = "date", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return dailyLogCategoryService.listForCaller(actingEmail(), date);
    }

    // ── Admin-only CRUD ────────────────────────────────────────────────────────

    /** All categories across both scopes, active and inactive — for the Org Masters admin tab. */
    @GetMapping("/all")
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public List<TaskCategoryDto> listAll() {
        return categoryRepository.findAllOrderByScopeAscNameAsc()
                .stream()
                .map(TaskCategoryDto::from)
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public TaskCategoryDto create(@Valid @RequestBody CreateTaskCategoryRequest request) {
        validateScope(request.scope());
        String trimmed = request.name().strip();
        if (categoryRepository.existsByNameIgnoreCaseAndScope(trimmed, request.scope())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A category named \"" + trimmed + "\" already exists in scope " + request.scope());
        }
        TaskCategory cat = new TaskCategory();
        cat.setName(trimmed);
        // Bench Log categories are never productive — a client-sent value is ignored for BENCH.
        cat.setIsProductive(BenchModePolicy.SCOPE_BENCH.equals(request.scope()) ? Boolean.FALSE : request.isProductive());
        cat.setActive(true);
        cat.setScope(request.scope());
        return TaskCategoryDto.from(categoryRepository.save(cat));
    }

    @PatchMapping("/{id}/toggle")
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public TaskCategoryDto toggle(@PathVariable Long id) {
        TaskCategory cat = categoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
        cat.setActive(!cat.getActive());
        return TaskCategoryDto.from(categoryRepository.save(cat));
    }

    @PatchMapping("/{id}/rename")
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public TaskCategoryDto rename(@PathVariable Long id, @Valid @RequestBody RenameTaskCategoryRequest request) {
        TaskCategory cat = categoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
        String trimmed = request.name().strip();
        if (!trimmed.equalsIgnoreCase(cat.getName())
                && categoryRepository.existsByNameIgnoreCaseAndScope(trimmed, cat.getScope())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A category named \"" + trimmed + "\" already exists in scope " + cat.getScope());
        }
        cat.setName(trimmed);
        return TaskCategoryDto.from(categoryRepository.save(cat));
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static void validateScope(String scope) {
        if (!"EMPLOYEE".equals(scope) && !"MANAGEMENT".equals(scope) && !BenchModePolicy.SCOPE_BENCH.equals(scope)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "scope must be EMPLOYEE, MANAGEMENT or BENCH");
        }
    }

    private static String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    // ── Request records ────────────────────────────────────────────────────────

    public record CreateTaskCategoryRequest(
            @NotBlank @Size(min = 2, max = 100) String name,
            @NotNull Boolean isProductive,
            @NotBlank String scope
    ) {}

    public record RenameTaskCategoryRequest(
            @NotBlank @Size(min = 2, max = 100) String name
    ) {}
}
