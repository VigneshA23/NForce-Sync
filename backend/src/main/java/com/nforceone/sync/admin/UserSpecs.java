package com.nforceone.sync.admin;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

public final class UserSpecs {

    private UserSpecs() {}

    public static Specification<AppUser> notDeleted() {
        return (root, query, cb) -> cb.isNull(root.get("deletedAt"));
    }

    public static Specification<AppUser> roleIs(AppUser.Role role) {
        return (root, query, cb) -> role == null ? null : cb.equal(root.get("role"), role);
    }

    public static Specification<AppUser> locationIdIs(Long locationId) {
        return (root, query, cb) -> locationId == null ? null : cb.equal(root.get("locationId"), locationId);
    }

    // OR-matches free text against name, email, and pre-resolved role/location candidates
    // (role display labels and location names are resolved to enum/id lists by the caller,
    // since neither can be computed inside a single SQL predicate).
    public static Specification<AppUser> matchesQuery(String q, List<AppUser.Role> matchingRoles,
                                                       List<Long> matchingLocationIds) {
        if (q == null || q.isBlank()) return null;
        String like = "%" + q.trim().toLowerCase() + "%";
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.like(cb.lower(root.get("fullName")), like));
            predicates.add(cb.like(cb.lower(root.get("email")), like));
            if (!matchingRoles.isEmpty()) {
                predicates.add(root.get("role").in(matchingRoles));
            }
            if (!matchingLocationIds.isEmpty()) {
                predicates.add(root.get("locationId").in(matchingLocationIds));
            }
            return cb.or(predicates.toArray(new Predicate[0]));
        };
    }
}
