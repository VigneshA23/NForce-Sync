package com.nforceone.sync.employee;

import com.nforceone.sync.businessrules.HolidayDto;
import com.nforceone.sync.employee.dto.EmployeeDashboardStatsDto;
import com.nforceone.sync.employee.dto.EmployeeProjectDto;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/employee")
public class EmployeeDashboardController {

    private final EmployeeDashboardService employeeDashboardService;

    public EmployeeDashboardController(EmployeeDashboardService employeeDashboardService) {
        this.employeeDashboardService = employeeDashboardService;
    }

    @GetMapping("/{id}/dashboard-stats")
    public EmployeeDashboardStatsDto getDashboardStats(@PathVariable Long id) {
        return employeeDashboardService.getDashboardStats(id, actingEmail());
    }

    @GetMapping("/{id}/projects")
    public List<EmployeeProjectDto> getProjects(@PathVariable Long id) {
        return employeeDashboardService.getProjects(id, actingEmail());
    }

    @GetMapping("/holidays/upcoming")
    public List<HolidayDto> getUpcomingHolidays() {
        return employeeDashboardService.getUpcomingHolidays();
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
