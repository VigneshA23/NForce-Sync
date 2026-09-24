package com.nforceone.sync.ai.repository;

import com.nforceone.sync.ai.entity.AiBillingSettings;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AiBillingSettingsRepository extends JpaRepository<AiBillingSettings, UUID> {

    /** V95 seeds exactly one row and a DB constraint enforces at most one — this is always that row. */
    Optional<AiBillingSettings> findFirstBySingletonTrue();
}
