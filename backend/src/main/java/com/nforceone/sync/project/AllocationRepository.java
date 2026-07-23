package com.nforceone.sync.project;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AllocationRepository extends JpaRepository<Allocation, Long> {
    List<Allocation> findByEmployeeId(Long employeeId);
    List<Allocation> findByProjectId(Long projectId);
}
