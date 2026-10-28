package com.nforceone.sync.employee;

import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Method;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EmployeeServiceDashboardTransactionTest {

    /**
     * The dashboard summary reads lazy task.acknowledgedBy / resolvedBy on the request thread. With open-in-view off
     * that needs a transaction around the method; dropping it 500s the dashboard for any employee whose blocker has
     * been acknowledged or resolved (commit ce9edc0 did exactly that).
     */
    @Test
    void getDashboardSummary_runsInAReadOnlyTransaction() throws Exception {
        Method m = EmployeeService.class.getMethod("getDashboardSummary", AppUser.class, LocalDate.class, LocalDate.class);
        Transactional tx = m.getAnnotation(Transactional.class);
        assertNotNull(tx, "getDashboardSummary must be @Transactional");
        assertTrue(tx.readOnly());
    }
}
