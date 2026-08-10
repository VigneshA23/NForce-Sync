package com.nforceone.sync.org;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BillingModelRepository extends JpaRepository<BillingModel, Long> {
    boolean existsByName(String name);
    List<BillingModel> findAllByOrderByNameAsc();
}
