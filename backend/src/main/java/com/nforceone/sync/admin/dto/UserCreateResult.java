package com.nforceone.sync.admin.dto;

import com.nforceone.sync.auth.dto.UserDto;

public record UserCreateResult(UserDto user, String tempPassword) {}
