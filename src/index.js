// Import the aws4fetch library
import { AwsClient } from 'aws4fetch';

/**
 * A Cloudflare Worker that proxies requests to a private S3 bucket
 * using AWS Signature Version 4 for authentication
 */

// Define environment variables that should be set in your worker's configuration
// via Cloudflare dashboard or wrangler.toml
// AWS_ACCESS_KEY_ID - your AWS access key
// AWS_SECRET_ACCESS_KEY - your AWS secret key
// AWS_REGION - the AWS region of your S3 bucket
// S3_BUCKET - the name of your S3 bucket
// PATH_PREFIX - the path prefix to remove from the request URL (e.g., "/s3")
// S3_PATH_PREFIX - the path prefix to add when requesting from S3 (e.g., "folder/subfolder/")
// REMOVE_QUERY_PARAMS - comma-separated list of query parameters to remove (e.g., "token,auth,signature")

export default {
  async fetch(request, env, ctx) {
    try {
      // Get the requested path and query parameters from the URL
      const url = new URL(request.url);
      
      // Get the PATH_PREFIX from environment variables or use a default
      const pathPrefix = env.PATH_PREFIX || '/s3';
      
      // Create a regex pattern based on the PATH_PREFIX
      const pathPrefixRegex = new RegExp(`^${pathPrefix}/?`);
      
      // Remove the configured path prefix from the URL pathname
      let path = url.pathname.replace(pathPrefixRegex, '');
      
      // Get the S3_PATH_PREFIX from environment variables or use empty string
      const s3PathPrefix = env.S3_PATH_PREFIX || '';
      
      // Configure AWS credentials
      const aws = new AwsClient({
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        region: env.AWS_REGION
      });
      
      // Combine the S3 path prefix with the path
      const fullS3Path = s3PathPrefix + path;
      
      // Create a new URL for the S3 request
      const s3Url = new URL(`https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${fullS3Path}`);
      
      // Process query parameters
      // Copy over query parameters from the original request, except for any that should be removed
      if (env.REMOVE_QUERY_PARAMS) {
        const paramsToRemove = env.REMOVE_QUERY_PARAMS.split(',').map(param => param.trim());
        
        // Copy all query parameters from the original URL to the S3 URL
        // except those that should be removed
        for (const [key, value] of url.searchParams.entries()) {
          if (!paramsToRemove.includes(key)) {
            s3Url.searchParams.append(key, value);
          }
        }
      } else {
        // If no parameters are specified to be removed, copy all parameters
        for (const [key, value] of url.searchParams.entries()) {
          s3Url.searchParams.append(key, value);
        }
      }
      
      // Sign the request
      const signedRequest = await aws.sign(s3Url.toString(), {
        method: request.method,
        headers: {
          'host': `${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com`
        }
      });
      
      // Forward the request to S3
      const response = await fetch(signedRequest);
      
      // Check if the response is successful
      if (!response.ok) {
        return new Response(`S3 Error: ${response.status} ${response.statusText}`, {
          status: response.status,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      // Create a new response with appropriate cache headers
      const modifiedResponse = new Response(response.body, response);
      
      // Add caching headers if the response is successful
      if (response.status === 200) {
        modifiedResponse.headers.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      }
      
      // Return the modified response
      return modifiedResponse;
    } catch (error) {
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
};