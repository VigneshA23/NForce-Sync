package com.nforceone.sync.project;

import com.nforceone.sync.project.dto.TaskCategoryDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/task-categories")
public class TaskCategoryController {

    private final TaskCategoryRepository categoryRepository;

    public TaskCategoryController(TaskCategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    @GetMapping
    public List<TaskCategoryDto> listActive() {
        return categoryRepository.findByActiveTrue()
                .stream()
                .sorted(java.util.Comparator.comparing(TaskCategory::getName))
                .map(TaskCategoryDto::from)
                .toList();
    }
}
