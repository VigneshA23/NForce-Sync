package com.nforceone.sync.myreports.utilization;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** The three tabs on the Team Utilization page. All are scoped to the CURRENT month. */
public enum UtilizationPeriodType {
    DAY, WEEK, MONTH;

    public static UtilizationPeriodType parse(String raw) {
        if (raw != null) {
            for (UtilizationPeriodType t : values()) {
                if (t.name().equalsIgnoreCase(raw.trim())) return t;
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "period must be one of: day, week, month");
    }

    public String wire() {
        return name().toLowerCase();
    }
}
