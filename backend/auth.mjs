import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { verifyToken } from '@clerk/backend';

const secretsClient = new SecretsManagerClient({});
const CLERK_SECRET_ARN = process.env.CLERK_SECRET_ARN;

// Cache the secret in memory (persists across warm invocations)
let cachedClerkSecretKey = null;

async function getClerkSecretKey(forceRefresh = false) {
  if (cachedClerkSecretKey && !forceRefresh) {
    return cachedClerkSecretKey;
  }
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: CLERK_SECRET_ARN })
  );
  cachedClerkSecretKey = response.SecretString;
  return cachedClerkSecretKey;
}

/**
 * AppSync Lambda Authorizer
 * Validates Clerk JWT and returns authorization response with userId in resolverContext
 */
export const handler = async (event) => {
  const authorizationToken = event.authorizationToken;

  if (!authorizationToken || !authorizationToken.startsWith('Bearer ')) {
    console.log('Missing or invalid authorization token format');
    return { isAuthorized: false };
  }

  const token = authorizationToken.substring(7);

  // Try with cached secret first
  try {
    const secretKey = await getClerkSecretKey();
    const { sub: userId } = await verifyToken(token, { secretKey });

    return {
      isAuthorized: true,
      resolverContext: {
        userId
      },
      // TTL for caching authorization decision (5 minutes)
      ttlOverride: 300
    };
  } catch (error) {
    // If verification failed and we used a cached key, retry with fresh secret
    if (cachedClerkSecretKey) {
      try {
        const freshSecretKey = await getClerkSecretKey(true);
        const { sub: userId } = await verifyToken(token, { secretKey: freshSecretKey });

        return {
          isAuthorized: true,
          resolverContext: {
            userId
          },
          ttlOverride: 300
        };
      } catch (retryError) {
        console.error('Token verification failed after retry:', retryError.message);
        return { isAuthorized: false };
      }
    }

    console.error('Token verification failed:', error.message);
    return { isAuthorized: false };
  }
};
