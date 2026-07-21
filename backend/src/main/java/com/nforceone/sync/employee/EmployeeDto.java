package com.nforceone.sync.employee;

public record EmployeeDto(
        Long id,
        String name,
        String email,
        String department
) {
    public static EmployeeDto from(Employee e) {
        return new EmployeeDto(e.getId(), e.getName(), e.getEmail(), e.getDepartment());
    }
}
