## Hosting files using AWS S3, CloudFront, and Cognito for authentication

This repository is a fork of the AWS sample [cloudfront-authorization-at-edge](https://github.com/aws-samples/cloudfront-authorization-at-edge/tree/master?tab=readme-ov-file#deploying-the-solution) repo. The `template.yml` file contains the code necessary to deploy this solution in AWS -- see the README in the original repo for deployment instructions.

### Architecture

- Uses an S3 bucket for file storage, including any web assets to be served.
- Uses Lambda@Edge functions to link a CloudFront app to Amazon Cognito for authentication.
- Cognito can be configured for SSO using OpenAthens or Microsoft Azure as the IdP. 
- The Lambda@Edge functions dispatch authentication to the Cognito User Pool defined as part of this template. 
- Content from the S3 bucket is served to authenticated users via CloudFront's distributed caches. 
- A browsable inventory is provided using S3's Inventory service, which generates a file in Apache Parquet format. The inventory file is converted to an HTML page to allow end users to browse the contents of the bucket. (This approach is suitable for an S3 bucket with a large number of objects that don't change very frequently, since the inventory service is more efficient than using the `listObjects` S3 API, but it cannot be triggered manually.)

For CloudFormation architecture details, see the [source repository](https://github.com/aws-samples/cloudfront-authorization-at-edge/tree/master?tab=readme-ov-file#deploying-the-solution).

### Deployment Details

- When deploying for use with existing resources (an S3 bucket and/or a Cognito user pool), the following parameters are required in the CloudFormation console:
  - `OriginAccessIdentity`: this ID will be referenced in the S3 policy granting access to the bucket from the CountFront app.
  - `S3OriginDomainName`: the URI of the s3 bucket, in the form `<bucket-name>.s3.<region-name>.amazonaws.com`
  - `UserPoolArn`: ARN of an existing Cognito pool
  - `UserPoolClientId` and `UserPoolClientSecret`: when using an existing pool, it's necessary to provide these values, too, which should refer to pre-existing user pool client (see `App Integrations` under the user pool settings in the AWS web console) or one created for this deployment.

- The following settings should be set regardless of whether the deployment uses existing resources or creates new ones:
  - `CreateCloudFrontDistribution`: `true`
  - `EnableSPAMode`: `false`
  - `HttpHeaders`: ```{ "Content-Security-Policy": "default-src 'none'; img-src 'self'; font-src 'self'; script-src 'self' https://cdn.jsdelivr.net/npm/hyparquet/src/ https://code.jquery.com https://stackpath.bootstrapcdn.com; style-src 'self' 'unsafe-inline' https://stackpath.bootstrapcdn.com; object-src 'none'; connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com", "Strict-Transport-Security": "max-age=31536000; includeSubdomains; preload", "Referrer-Policy": "same-origin", "X-XSS-Protection": "1; mode=block", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff"}```
	

- The S3 bucket needs a policy following this template:
  ```
  "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity {Your Origin Access Identity}"
            },
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::{Your S3 ARN}/*"
        },
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity {Your Origin Access Identity}"
            },
            "Action": "s3:ListBucket",
            "Resource": "arn:aws:s3:::{Your S3 ARN}"
        }
    ]
  ```
  - The S3 bucket's inventory should be configured to run at the desired interval (daily or weekly) and to include the `size` and `last_modified_date` metadata attributes.

### Customization

The `custom-assets` folder contains web assets to be served from the S3 bucket. These should be placed in the root folder of the bucket. 

1. `index.html` and `js/download.js` implement a landing page for downloading individual files (S3 "objects") from the site. The landing-page code expects a URL parameter with a path to a resource in the S3 bucket, constructed as follows: `?file=/path/to/resource`, including the resource's filename and extension. 
2. `inventory.html` and `js/load_parquet.js` implement a browsable directory tree derived from an S3 inventory file in Apache Parquet format. 
The index includes the names of resources at a given path, a parametrized URL for accessing each one directly, the size of the object (in bytes), and the last-modified date and time.

The `custom-lambdas` folder contains Python code to be implemented as a Lambda (*not* Lambda@Edge) with a trigger linked to the S3 bucket. The Lambda function selects the most recent inventory file and renames it for use by the Javascript code that creates the browsable inventory.

1. The trigger uses the following event types: `s3:ObjectCreated:*`.
2. It has a `prefix` value corresponding to the `data` directory where the inventory Parquet files are created..
3. The Lambda is associated with a policy that defines permissions to list the objects in the S3 bucket and to get/put an object in the bucket.
4. The Lambda (re)creates the `inventory.parquet` file, which contains an updated list of all files and paths the bucket.