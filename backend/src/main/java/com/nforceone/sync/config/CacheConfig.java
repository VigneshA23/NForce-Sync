package com.nforceone.sync.config;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * In-process cache for the singleton {@code business_rule_config} row (see
 * BusinessRuleConfigRepository). That row backs the weekend-rule check that over a dozen
 * services each re-implement as a private per-call {@code isWeekend(date)} helper, invoked once
 * per day inside date-range loops (calendar grids, streak calculations, missing-EOD walks). Every
 * one of those calls was its own round trip to the remote Neon DB — a single Employee Dashboard
 * load could fire 30-80 of them, which is what turned a sub-second page into a 10-65 second one.
 * The row changes only through the Business Rules admin screen (BusinessRuleService evicts on
 * every write), so caching it here fixes every caller at once without threading the resolved
 * value through each service's loop.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        return new ConcurrentMapCacheManager("businessRuleConfig");
    }
}
