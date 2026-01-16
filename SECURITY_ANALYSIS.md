# Security Analysis

Security review of the todo application infrastructure and code.

## Summary

The application has a solid security foundation with proper authentication, user isolation, and secure hosting. A few medium-severity items remain as future improvements.

## Architecture Overview

```
CloudFront (HTTPS) → S3 (private bucket)
         ↓
    React App → API Gateway → Lambda → DynamoDB
                    ↑
              Clerk JWT Auth
```

## Security Strengths

### Authentication
- All API endpoints require valid Clerk JWT tokens
- Token verification happens server-side in Lambda
- Failed auth returns 401 without leaking information
- Clerk secret stored in AWS Secrets Manager (not visible in Lambda console)

### User Isolation
- DynamoDB partitioned by `userId` (partition key)
- Users cannot access each other's data
- All queries scoped to authenticated user's ID

### Data Protection
- DynamoDB point-in-time recovery enabled (35-day retention)
- Can restore to any second within the retention window

### Input Validation
- Todo text validated on create and update
- Maximum 1000 characters enforced
- Empty/whitespace-only text rejected

### Frontend Hosting
- S3 bucket has all public access blocked
- CloudFront accesses S3 via Origin Access Control (OAC)
- Bucket policy scoped to specific CloudFront distribution ARN

### Transport Security
- HTTPS enforced (CloudFront redirects HTTP → HTTPS)
- TLS 1.2+ minimum protocol version
- Custom domain with ACM certificate

### CORS
- Restricted to specific origins:
  - `https://app.cebarrett.me` (production)
  - `http://localhost:5173` (development)
  - `http://localhost:4173` (preview)
- Dynamic origin matching in Lambda handler

### IAM Permissions
- Lambda has least-privilege access (DynamoDB CRUD for its table only)
- No wildcard resource permissions

### API Throttling
- Rate limited to 10 requests/second
- Burst limit of 20 concurrent requests
- Protects against DoS and cost attacks

## Remaining Issues

### Low Severity

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Verbose error logging | `handler.mjs:67` | Token errors in CloudWatch | Reduce verbosity in production |

## Recommendations

### Low Priority

1. **Add security headers** to CloudFront:
   ```yaml
   ResponseHeadersPolicyId: 67f7725c-6f97-4210-82d7-5512b31e9d03  # SecurityHeadersPolicy
   ```

## Not Applicable / Out of Scope

- **SQL Injection**: Not applicable (DynamoDB, not SQL)
- **XSS**: React handles escaping; no `dangerouslySetInnerHTML`
- **CSRF**: Token-based auth (Bearer JWT), not cookie-based

## Review Date

January 2026
