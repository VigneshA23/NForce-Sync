package com.nforceone.sync.project;

import com.nforceone.sync.project.dto.TaskCategoryDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/task-categories")
public class TaskCategoryController {

    private final TaskCategoryRepository categoryRepository;

    public TaskCategoryController(TaskCategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    // ── Public list (dropdown use) ─────────────────────────────────────────────

    // V110: scope param selects EMPLOYEE (Submit EOD) or MANAGEMENT (Daily Log).
    // Default is EMPLOYEE so all existing Submit EOD calls never receive MANAGEMENT categories.
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<TaskCategoryDto> listActive(
            @RequestParam(name = "scope", defaultValue = "EMPLOYEE") String scope) {
        validateScope(scope);
        return categoryRepository.findByScopeAndActiveTrueOrderByNameAsc(scope)
                .stream()
                .map(TaskCategoryDto::from)
                .toList();
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
        cat.setIsProductive(request.isProductive());
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
        if (!"EMPLOYEE".equals(scope) && !"MANAGEMENT".equals(scope)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "scope must be EMPLOYEE or MANAGEMENT");
        }
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
