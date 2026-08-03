package com.nforceone.sync.employee;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.employee.dto.DashboardSummaryDto;
import com.nforceone.sync.employee.dto.UtilizationDetailDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/employee")
public class EmployeeController {

    private final AppUserRepository userRepository;
    private final EmployeeService   employeeService;

    public EmployeeController(AppUserRepository userRepository, EmployeeService employeeService) {
        this.userRepository  = userRepository;
        this.employeeService = employeeService;
    }

    @GetMapping("/dashboard-summary")
    public DashboardSummaryDto dashboardSummary() {
        AppUser user = currentUser();
        return employeeService.getDashboardSummary(user.getId());
    }

    @GetMapping("/utilization-detail")
    public UtilizationDetailDto utilizationDetail(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' must not be after 'to'");
        }
        AppUser user = currentUser();
        return employeeService.getUtilizationDetail(user.getId(), from, to);
    }

    private AppUser currentUser() {
        String email = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
