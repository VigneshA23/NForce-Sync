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

    // The global category master, identical for every caller regardless of role, team, or
    // project — see V60. This is the single source the Employee Submit EOD dropdown and any
    // other category picker in the app should read from.
    @GetMapping
    public List<TaskCategoryDto> listActive() {
        return categoryRepository.findAllActiveOrderByName()
                .stream()
                .map(TaskCategoryDto::from)
                .toList();
    }
}
