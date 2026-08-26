package com.nforceone.sync.search;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/search")
public class SearchController {

    private final SearchService searchService;

    public SearchController(SearchService searchService) {
        this.searchService = searchService;
    }

    @GetMapping
    public SearchResultDto search(@RequestParam(required = false, defaultValue = "") String q) {
        if (q.trim().length() < 2) {
            return new SearchResultDto(java.util.List.of(), java.util.List.of());
        }
        String actorEmail = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return searchService.search(q, actorEmail);
    }
}
