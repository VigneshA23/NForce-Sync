package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.ai.contract.KnowledgeType;
import com.nforceone.sync.ai.contract.RetrievalResult;
import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.*;

class AssistantDataServiceTest {

    private static AssistantRequestContext context(AppUser.Role role) {
        return new AssistantRequestContext(1L, "e@nforceone.com", role, role.name(), null, null);
    }

    private static RetrievalResult knowledgeIn(String module, double score) {
        return new RetrievalResult("k", 0, KnowledgeType.ACTION, module, null, "src", "t", "b", score);
    }

    private static AssistantDataProvider provider(String id, Set<AppUser.Role> audiences, Set<String> modules,
            Function<AssistantRequestContext, Optional<String>> fetch) {
        return new AssistantDataProvider() {
            @Override public String id() { return id; }
            @Override public String title() { return id; }
            @Override public Set<AppUser.Role> audiences() { return audiences; }
            @Override public Set<String> modules() { return modules; }
            @Override public Optional<String> fetch(AssistantRequestContext ctx) { return fetch.apply(ctx); }
        };
    }

    @Test
    void withNoProvidersReturnsNothing() {
        AiProperties properties = new AiProperties();
        AssistantDataService service = new AssistantDataService(List.of(), properties);
        var selection = service.fetch(context(AppUser.Role.EMPLOYEE), List.of(knowledgeIn("eod", 0.9)), null);
        assertTrue(selection.sections().isEmpty());
    }

    @Test
    void liveDataDisabledFlagSuppressesAllProviders() {
        AiProperties properties = new AiProperties();
        properties.setLiveDataEnabled(false);
        AssistantDataProvider p = provider("eod.today", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"),
                ctx -> Optional.of("data"));
        AssistantDataService service = new AssistantDataService(List.of(p), properties);

        var selection = service.fetch(context(AppUser.Role.EMPLOYEE), List.of(knowledgeIn("eod", 0.9)), null);
        assertTrue(selection.sections().isEmpty());
    }

    @Test
    void providerWithWrongAudienceIsNeverSelected() {
        AiProperties properties = new AiProperties();
        AssistantDataProvider p = provider("admin.stats", Set.of(AppUser.Role.ADMIN), Set.of("eod"),
                ctx -> Optional.of("data"));
        AssistantDataService service = new AssistantDataService(List.of(p), properties);

        var selection = service.fetch(context(AppUser.Role.EMPLOYEE), List.of(knowledgeIn("eod", 0.9)), null);
        assertTrue(selection.sections().isEmpty());
        assertTrue(selection.providerIds().isEmpty());
    }

    @Test
    void providerWithNoRelevantModuleIsNotSelected() {
        AiProperties properties = new AiProperties();
        AssistantDataProvider p = provider("eod.today", Set.of(AppUser.Role.EMPLOYEE), Set.of("blockers"),
                ctx -> Optional.of("data"));
        AssistantDataService service = new AssistantDataService(List.of(p), properties);

        var selection = service.fetch(context(AppUser.Role.EMPLOYEE), List.of(knowledgeIn("eod", 0.9)), null);
        assertTrue(selection.sections().isEmpty());
    }

    @Test
    void currentPageModuleAloneMakesAProviderEligible() {
        AiProperties properties = new AiProperties();
        AssistantDataProvider p = provider("eod.today", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"),
                ctx -> Optional.of("today's status"));
        AssistantDataService service = new AssistantDataService(List.of(p), properties);

        var selection = service.fetch(context(AppUser.Role.EMPLOYEE), List.of(), "eod");
        assertEquals(1, selection.sections().size());
        assertEquals("today's status", selection.sections().get(0).body());
    }

    @Test
    void atMostThreeProvidersRunPerTurn() {
        AiProperties properties = new AiProperties();
        List<AssistantDataProvider> providers = List.of(
                provider("a.1", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"), ctx -> Optional.of("1")),
                provider("b.1", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"), ctx -> Optional.of("2")),
                provider("c.1", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"), ctx -> Optional.of("3")),
                provider("d.1", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"), ctx -> Optional.of("4")));
        AssistantDataService service = new AssistantDataService(providers, properties);

        var selection = service.fetch(context(AppUser.Role.EMPLOYEE), List.of(knowledgeIn("eod", 0.9)), null);
        assertEquals(3, selection.sections().size());
    }

    @Test
    void diversityAcrossFamiliesGivesEveryRelevantFamilyAtLeastOneSlot() {
        // Mirrors the OneHR-documented bug: three same-family providers must not crowd out a
        // second, genuinely relevant family entirely.
        AiProperties properties = new AiProperties();
        List<AssistantDataProvider> providers = List.of(
                provider("leave.balances", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"), ctx -> Optional.of("x")),
                provider("leave.mine", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"), ctx -> Optional.of("x")),
                provider("leave.pending", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"), ctx -> Optional.of("x")),
                provider("blockers.mine", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"), ctx -> Optional.of("x")));
        AssistantDataService service = new AssistantDataService(providers, properties);

        var selection = service.fetch(context(AppUser.Role.EMPLOYEE), List.of(knowledgeIn("eod", 0.9)), null);
        assertEquals(3, selection.providerIds().size());
        assertTrue(selection.providerIds().stream().anyMatch(id -> id.startsWith("blockers.")),
                "the 'blockers' family must get at least one slot despite 'leave' having three candidates: "
                        + selection.providerIds());
    }

    @Test
    void aFailingProviderDoesNotBreakTheTurnOrOtherProviders() {
        AiProperties properties = new AiProperties();
        AssistantDataProvider failing = provider("a.broken", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"),
                ctx -> { throw new RuntimeException("boom"); });
        AssistantDataProvider healthy = provider("b.ok", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"),
                ctx -> Optional.of("fine"));
        AssistantDataService service = new AssistantDataService(List.of(failing, healthy), properties);

        var selection = service.fetch(context(AppUser.Role.EMPLOYEE), List.of(knowledgeIn("eod", 0.9)), null);
        assertEquals(1, selection.sections().size());
        assertEquals("fine", selection.sections().get(0).body());
    }

    @Test
    void aProviderReturningEmptyContributesNoSectionButStillCountsAsHavingRun() {
        AiProperties properties = new AiProperties();
        AssistantDataProvider p = provider("a.empty", Set.of(AppUser.Role.EMPLOYEE), Set.of("eod"), ctx -> Optional.empty());
        AssistantDataService service = new AssistantDataService(List.of(p), properties);

        var selection = service.fetch(context(AppUser.Role.EMPLOYEE), List.of(knowledgeIn("eod", 0.9)), null);
        assertTrue(selection.sections().isEmpty());
        assertEquals(List.of("a.empty"), selection.providerIds());
    }
}
