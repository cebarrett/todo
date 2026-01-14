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

## Remaining Issues

### Medium Severity

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Clerk secret in env var | `template.yaml:34` | Visible in Lambda console to AWS users | Move to AWS Secrets Manager |
| Client-generated todoId | `handler.mjs:57` | Client controls ID, could cause conflicts | Generate UUID server-side |
| No API throttling | `template.yaml:55` | DoS/cost attacks possible | Add `ThrottlingBurstLimit` / `ThrottlingRateLimit` |

### Low Severity

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| No input validation on text | `handler.mjs:59` | Unbounded string could bloat DB | Add max length check (e.g., 1000 chars) |
| Verbose error logging | `handler.mjs:31,181` | Token errors in CloudWatch | Reduce verbosity in production |

## Recommendations

### High Priority

1. **Add API throttling** to prevent abuse:
   ```yaml
   TodoApi:
     Type: AWS::Serverless::HttpApi
     Properties:
       ThrottlingBurstLimit: 100
       ThrottlingRateLimit: 50
   ```

2. **Generate todoId server-side**:
   ```javascript
   import { randomUUID } from 'crypto';
   const item = {
     userId,
     todoId: randomUUID(),  // Server-generated instead of client-provided
     // ...
   };
   ```

### Medium Priority

3. **Move Clerk secret to Secrets Manager**:
   - Create secret in AWS Secrets Manager
   - Grant Lambda permission to read it
   - Fetch at cold start, cache in memory

4. **Add input validation**:
   ```javascript
   if (!todo.text || todo.text.length > 1000) {
     return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid text' }) };
   }
   ```

### Low Priority

5. **Add security headers** to CloudFront:
   ```yaml
   ResponseHeadersPolicyId: 67f7725c-6f97-4210-82d7-5512b31e9d03  # SecurityHeadersPolicy
   ```

6. **Enable DynamoDB point-in-time recovery** for data protection:
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
