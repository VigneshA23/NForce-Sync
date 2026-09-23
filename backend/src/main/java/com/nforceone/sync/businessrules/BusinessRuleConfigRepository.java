package com.nforceone.sync.businessrules;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BusinessRuleConfigRepository extends JpaRepository<BusinessRuleConfig, Long> {

    // Overridden purely to cache it — see CacheConfig for why. BusinessRuleService.touch()
    // evicts this (beforeInvocation=true) on every write, so a write never reads or mutates a
    // stale cached instance; every other caller gets the singleton row without a network round
    // trip once it's warm.
    @Override
    @Cacheable("businessRuleConfig")
    Optional<BusinessRuleConfig> findById(Long id);
}
