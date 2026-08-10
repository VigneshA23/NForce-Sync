package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.dto.TaskCategoryDto;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/task-categories")
public class TaskCategoryController {

    private final TaskCategoryRepository categoryRepository;
    private final AppUserRepository userRepository;

    public TaskCategoryController(TaskCategoryRepository categoryRepository, AppUserRepository userRepository) {
        this.categoryRepository = categoryRepository;
        this.userRepository = userRepository;
    }

    // Global categories plus the caller's own team's: their manager's (Team Lead's) categories,
    // and — if the caller is themself a Team Lead — the categories they created. Scoped
    // server-side via TaskCategoryRepository.findVisibleTo, not just filtered in the frontend.
    @GetMapping
    public List<TaskCategoryDto> listActive() {
        AppUser actor = userRepository.findByEmailAndDeletedAtIsNull(actingEmail())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));

        List<Long> managerIds = new ArrayList<>();
        managerIds.add(actor.getId());
        if (actor.getManager() != null) {
            managerIds.add(actor.getManager().getId());
        }

        return categoryRepository.findVisibleTo(managerIds)
                .stream()
                .map(TaskCategoryDto::from)
                .toList();
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
