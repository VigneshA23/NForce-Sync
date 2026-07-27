package com.nforceone.sync.auth.dto;

public record LoginResponse(String token, UserDto user, boolean mustChangePassword) {}
