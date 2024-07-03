import boto3
import json 
import os
from collections.abc import Iterator
#from datetime import datetime as dt

s3 = boto3.client('s3')

INVENTORY_EXT = os.getenv('INVENTORY_EXT', '.parquet')

def get_objects(bucket: str, prefix: str, token: str=None) -> Iterator[dict]:
    '''
    Given an S3 bucket name, and prefix, and (optionally) a continuation token, 
    retrieves the objects in that bucket. Invoked recursively to retrieve all objects in the bucket at the given prefix.
    '''
    try:
        if token:
            response = s3.list_objects_v2(Bucket=bucket, MaxKeys=1000, Prefix=prefix, ContinuationToken=token)
        else:
            response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1000)
        contents = response.get('Contents')
        for obj in contents:
            yield obj
    except Exception as e:
        print(e)
        print('Error getting objects from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(bucket))
        raise e
    if response.get('IsTruncated'):
        token = response.get('NextContinuationToken')
        yield from get_objects(bucket, prefix, token)

def find_latest_inventory(objs: Iterator[dict]) -> dict:
    '''Filters a list of objects metadata to find and return the most recently updated object's metadata.'''
    return sorted(list(objs), key=lambda x: x['LastModified'], reverse=True)[0]

def put_bucket_inventory(bucket: str, inventory_obj: dict, key: str, max_age: str=None):
    '''
    Copies the object indicated by the metadata, saving it to the specified key, and updating the CacheControl header, if applicable.
    '''
    params = {'CopySource': {'Bucket': bucket,
                            'Key': inventory_obj['Key']},
                'Bucket': bucket,
                'Key': key}
    if max_age:
        params.update({'MetadataDirective': 'REPLACE',
                        'Metadata': {'Content-Type': 'application/octet-stream'},
                        'CacheControl': f'max-age={max_age}'})
    return s3.copy_object(**params)
    

def lambda_handler(event, context):
    # Get the object from the event 
    data_prefix = os.getenv('DATA_PREFIX')
    target_key = os.getenv('TARGET_KEY', f'/inventory{INVENTORY_EXT}')
    if data_prefix:
        if not data_prefix.endswith('/'):
            data_prefix += '/'
        bucket = event['Records'][0]['s3']['bucket']['name']
        latest_inventory = find_latest_inventory(get_objects(bucket, prefix=data_prefix))
        put_bucket_inventory(bucket=bucket, 
                             inventory_obj=latest_inventory, 
                             key=target_key, 
                             max_age='300')
              