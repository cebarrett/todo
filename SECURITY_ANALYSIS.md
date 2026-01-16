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

### Medium Severity

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Client-generated todoId | `handler.mjs:75` | Client controls ID, could cause conflicts | Generate UUID server-side |

### Low Severity

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| No input validation on text | `handler.mjs:59` | Unbounded string could bloat DB | Add max length check (e.g., 1000 chars) |
| Verbose error logging | `handler.mjs:31,181` | Token errors in CloudWatch | Reduce verbosity in production |

## Recommendations

### High Priority

1. **Generate todoId server-side**:
   ```javascript
   import { randomUUID } from 'crypto';
   const item = {
     userId,
     todoId: randomUUID(),  // Server-generated instead of client-provided
     // ...
   };
   ```

### Medium Priority

2. **Add input validation**:
   ```javascript
   if (!todo.text || todo.text.length > 1000) {
     return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid text' }) };
   }
   ```

### Low Priority

4. **Add security headers** to CloudFront:
   ```yaml
   ResponseHeadersPolicyId: 67f7725c-6f97-4210-82d7-5512b31e9d03  # SecurityHeadersPolicy
   ```

5. **Enable DynamoDB point-in-time recovery** for data protection:
   ```yaml
   TodoTable:
     Type: AWS::DynamoDB::Table
     Properties:
       PointInTimeRecoverySpecification:
         PointInTimeRecoveryEnabled: true
   ```

## Not Applicable / Out of Scope

- **SQL Injection**: Not applicable (DynamoDB, not SQL)
- **XSS**: React handles escaping; no `dangerouslySetInnerHTML`
- **CSRF**: Token-based auth (Bearer JWT), not cookie-based

## Review Date

January 2026
