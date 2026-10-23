package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.TaskCategoryRepository;
import com.nforceone.sync.project.dto.TaskCategoryDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

/**
 * The category list for the Daily Log "Select category..." dropdown. The caller never chooses the scope:
 * it is decided here from who they are and the entry date (see {@link BenchModePolicy}) — BENCH categories
 * for an EMPLOYEE on the bench, MANAGEMENT categories for everyone else. Active categories only.
 */
@Service
@Transactional(readOnly = true)
public class DailyLogCategoryService {

    private final AppUserRepository userRepository;
    private final EodEntryRepository entryRepository;
    private final TaskCategoryRepository categoryRepository;
    private final BenchModePolicy benchModePolicy;

    public DailyLogCategoryService(AppUserRepository userRepository,
                                   EodEntryRepository entryRepository,
                                   TaskCategoryRepository categoryRepository,
                                   BenchModePolicy benchModePolicy) {
        this.userRepository = userRepository;
        this.entryRepository = entryRepository;
        this.categoryRepository = categoryRepository;
        this.benchModePolicy = benchModePolicy;
    }

    /**
     * @param date the entry date being logged; null means today. If the caller already has an entry for that
     *             date, that entry's frozen {@code benchMode} wins over the current allocation — the same flag
     *             save and submit validate against, so the dropdown can never offer what they would reject.
     */
    public List<TaskCategoryDto> listForCaller(String actingEmail, LocalDate date) {
        AppUser caller = userRepository.findByEmailAndDeletedAtIsNull(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated"));
        LocalDate entryDate = date != null ? date : LocalDate.now();

        boolean bench = entryRepository.findByEmployeeIdAndEntryDate(caller.getId(), entryDate)
                .map(e -> Boolean.TRUE.equals(e.getBenchMode()))
                .orElseGet(() -> benchModePolicy.isBenchMode(caller, entryDate));

        return categoryRepository.findByScopeAndActiveTrueOrderByNameAsc(BenchModePolicy.requiredScope(bench))
                .stream()
                .map(TaskCategoryDto::from)
                .toList();
    }
}
