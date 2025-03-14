# S3 Private Content Access Worker

This project provides a Cloudflare Worker that securely proxies requests to private content stored in Amazon S3 buckets.

## Features

- Securely proxies requests to private S3 buckets
- Uses AWS Signature Version 4 for authentication
- Handles caching configuration
- Maintains privacy of AWS credentials
- Configurable routing with environment variables:
  - `PATH_PREFIX`: Path prefix to remove from incoming requests
  - `S3_PATH_PREFIX`: Path prefix to add when requesting from S3
  - `REMOVE_QUERY_PARAMS`: Query parameters to remove when forwarding to S3

## Deployment Instructions

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Authenticate:
   ```bash
   wrangler login
   ```

3. Create a new project:
   ```bash
   mkdir s3-worker
   cd s3-worker
   wrangler init
   ```

4. Install the aws4fetch library:
   ```bash
   npm install aws4fetch
   ```

5. Update your `wrangler.toml` file:
   ```toml
   name = "s3-worker"
   main = "src/index.js"
   compatibility_date = "2024-03-14"
   
   # Route configuration - specifies which hostname and path pattern should be handled by this worker
   route = { pattern = "signedurl.whereismypacket.net/s3/*", zone_name = "whereismypacket.net" }
   
   [vars]
   AWS_REGION = "us-east-1"
   S3_BUCKET = "your-bucket-name"
   PATH_PREFIX = "/s3"  # Path prefix to remove from incoming requests
   S3_PATH_PREFIX = "folder/subfolder/"  # Path prefix to add when requesting from S3
   REMOVE_QUERY_PARAMS = "token,signature,auth"  # Query parameters to remove when forwarding to S3
   
   # For security, add secrets using wrangler (do not add these to your toml file)
   # wrangler secret put AWS_ACCESS_KEY_ID
   # wrangler secret put AWS_SECRET_ACCESS_KEY
   ```

6. Replace the `src/index.js` file with the provided worker code

7. Add your AWS credentials as secrets:
   ```bash
   wrangler secret put AWS_ACCESS_KEY_ID
   wrangler secret put AWS_SECRET_ACCESS_KEY
   ```

8. Deploy the worker:
   ```bash
   wrangler publish
   ```

## AWS IAM Configuration

For the S3 access to work properly, configure an IAM user with the following policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::your-bucket-name/*"
        }
    ]
}
```

## Path Mapping Configuration

The worker uses environment variables to control how paths are mapped from the incoming request to the S3 bucket:

### Path Mapping Examples

| User Request URL | PATH_PREFIX | S3_PATH_PREFIX | Resulting S3 Path |
|------------------|-------------|----------------|-------------------|
| /s3/image.jpg | /s3 | documents/ | documents/image.jpg |
| /files/doc.pdf | /files | restricted/pdfs/ | restricted/pdfs/doc.pdf |
| /assets/img/logo.png | /assets | public/ | public/img/logo.png |

### Practical Access Example

For example, with these configurations:
- `S3_BUCKET`: "signedurl-cloudflare"
- `PATH_PREFIX`: "/s3"
- `S3_PATH_PREFIX`: "files/pdfs/"

If a user tries to access:
```
https://signedurl.whereismypacket.net/s3/mypdf.pdf
```

The worker will:
1. Remove the `/s3/` prefix
2. Add the `files/pdfs/` prefix
3. Remove any query parameters specified in `REMOVE_QUERY_PARAMS`
4. Request the file from S3 at:
```
https://signedurl-cloudflare.s3.us-east-1.amazonaws.com/files/pdfs/mypdf.pdf
```

For example, if the request includes query parameters:
```
https://signedurl.whereismypacket.net/s3/mypdf.pdf?token=123&page=5&signature=abc
```

And `REMOVE_QUERY_PARAMS = "token,signature"`, then the worker will forward:
```
https://signedurl-cloudflare.s3.us-east-1.amazonaws.com/files/pdfs/mypdf.pdf?page=5
```

Trying to access the S3 URL directly will fail with a 403 error since the bucket is private:
```
https://signedurl-cloudflare.s3.us-east-1.amazonaws.com/files/pdfs/mypdf.pdf
```

But through the worker, users can access the file without needing AWS credentials themselves.

## Cache Configuration

For optimal performance with CloudFlare caching:

1. Go to Cloudflare dashboard > Caching > Configuration
2. Set appropriate Edge TTL and Browser TTL settings
3. For cached content, the worker adds:
   ```
   Cache-Control: public, max-age=86400
   ```
   This caches content for 24 hours by default.

## Switching from R2 to S3

If you're migrating from Cloudflare R2 to Amazon S3, note these key differences:

1. **Authentication**: S3 uses AWS Signature V4, while R2 used Cloudflare's authentication
2. **Endpoint Structure**: S3 endpoints follow the pattern `https://bucket-name.s3.region.amazonaws.com/`
3. **Headers**: S3 requires specific AWS authentication headers
4. **Permissions**: S3 uses AWS IAM for access control
5. **Path Structure**: You can use the `PATH_PREFIX` and `S3_PATH_PREFIX` environment variables to map your existing URL paths to the appropriate S3 paths

## Troubleshooting

- **403 Forbidden Errors**: Check IAM permissions and credentials
- **Signature Mismatch**: Ensure your system clock is synchronized
- **Cross-Origin Issues**: Configure proper CORS settings on your S3 bucket:
  
  ```json
  [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET"],
      "AllowedOrigins": ["https://your-domain.com"],
      "ExposeHeaders": ["ETag"]
    }
  ]
  ```

- **Cache Issues**: Verify Cloudflare cache settings in the dashboard

## Security Notes

- Rotate AWS access keys regularly
- Use the principle of least privilege for IAM policies
- Consider implementing IP restrictions in your IAM policies
- Store AWS credentials as Worker secrets, never in code or in `wrangler.toml`