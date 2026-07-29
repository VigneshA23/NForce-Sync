package com.nforceone.sync.businessrules;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface HolidayRepository extends JpaRepository<Holiday, Long> {
    List<Holiday> findAllByOrderByHolidayDateAsc();
    boolean existsByHolidayDate(java.time.LocalDate date);
}
