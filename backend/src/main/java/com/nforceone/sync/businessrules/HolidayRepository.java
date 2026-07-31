package com.nforceone.sync.businessrules;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HolidayRepository extends JpaRepository<Holiday, Long> {
    List<Holiday> findAllByOrderByHolidayDateAsc();
    boolean existsByHolidayDate(java.time.LocalDate date);
    Optional<Holiday> findByHolidayDate(java.time.LocalDate date);
}
