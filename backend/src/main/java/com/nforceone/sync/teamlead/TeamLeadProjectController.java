package com.nforceone.sync.teamlead;

import com.nforceone.sync.project.dto.CreateProjectCategoryRequest;
import com.nforceone.sync.project.dto.DeleteCategoryResult;
import com.nforceone.sync.project.dto.ProjectCategoryDto;
import com.nforceone.sync.project.dto.ProjectDetailDto;
import com.nforceone.sync.project.dto.ProjectFullDto;
import com.nforceone.sync.project.dto.UpdateProjectCategoryRequest;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Backs the Team Lead "My Projects" module — restricted to MANAGER (the Team Lead role; see
 * BACKEND_ROLE_MAP on the frontend) since every list here is scoped to the acting Team Lead.
 * Projects and categories are independent: categories are generic master data owned by the
 * Team Lead who created them and are never filtered by project assignment.
 */
@RestController
@RequestMapping("/api/team-lead")
@PreAuthorize("hasRole('MANAGER')")
public class TeamLeadProjectController {

    private final TeamLeadProjectService teamLeadProjectService;

    public TeamLeadProjectController(TeamLeadProjectService teamLeadProjectService) {
        this.teamLeadProjectService = teamLeadProjectService;
    }

    @GetMapping("/projects")
    public List<ProjectFullDto> listMyProjects(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return teamLeadProjectService.listMyProjects(actingEmail(), date != null ? date : LocalDate.now());
    }

    @GetMapping("/projects/{id}")
    public ProjectDetailDto getProjectDetail(
            @PathVariable Long id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return teamLeadProjectService.getProjectDetail(actingEmail(), id, date != null ? date : LocalDate.now());
    }

    @GetMapping("/categories")
    public List<ProjectCategoryDto> listCategories() {
        return teamLeadProjectService.listCategories(actingEmail());
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    public ProjectCategoryDto createCategory(@Valid @RequestBody CreateProjectCategoryRequest request) {
        return teamLeadProjectService.createCategory(request, actingEmail(), LocalDate.now());
    }

    @PutMapping("/categories/{id}")
    public ProjectCategoryDto updateCategory(@PathVariable Long id, @Valid @RequestBody UpdateProjectCategoryRequest request) {
        return teamLeadProjectService.updateCategory(id, request, actingEmail());
    }

    @DeleteMapping("/categories/{id}")
    public DeleteCategoryResult deleteCategory(@PathVariable Long id) {
        return teamLeadProjectService.deleteCategory(id, actingEmail());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
