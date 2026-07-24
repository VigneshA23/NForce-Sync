package com.nforceone.sync.project;

import com.nforceone.sync.project.dto.ProjectDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectRepository projectRepository;

    public ProjectController(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    @GetMapping
    public List<ProjectDto> listActive() {
        return projectRepository.findByStatusOrderByNameAsc(Project.Status.ACTIVE)
                .stream()
                .map(ProjectDto::from)
                .toList();
    }
}
