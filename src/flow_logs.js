/**
 * Build an S3 bucket for logging
 *
 * @param {String} stage
 * @return {Object}
 */
function buildLogBucket(stage) {
  return {
    LogBucket: {
      Type: 'AWS::S3::Bucket',
      DeletionPolicy: 'Retain',
      Properties: {
        AccessControl: 'LogDeliveryWrite',
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        Tags: [
          {
            Key: 'STAGE',
            Value: stage,
          },
          {
            Key: 'Name',
            Value: {
              'Fn::Join': [' ', [{ Ref: 'AWS::StackName' }, 'Logs']],
            },
          },
        ],
      },
    },
  };
}

/**
 * Build an S3 Bucket Policy for the logging bucket
 *
 * @return {Object}
 * @see https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs-s3.html#flow-logs-s3-permissions
 */
function buildLogBucketPolicy() {
  return {
    LogBucketPolicy: {
      Type: 'AWS::S3::BucketPolicy',
      Properties: {
        Bucket: {
          Ref: 'LogBucket',
        },
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'AWSLogDeliveryAclCheck',
              Effect: 'Allow',
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Action: 's3:GetBucketAcl',
              Resource: {
                'Fn::GetAtt': ['LogBucket', 'Arn'],
              },
            },
            {
              Sid: 'AWSLogDeliveryWrite',
              Effect: 'Allow',
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Action: 's3:PutObject',
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    'arn:aws:s3:::',
                    { Ref: 'LogBucket' },
                    '/AWSLogs/',
                    { Ref: 'AWS::AccountId' },
                    '/*',
                  ],
                ],
              },
              Condition: {
                StringEquals: {
                  's3:x-amz-acl': 'bucket-owner-full-control',
                },
              },
            },
          ],
        },
      },
    },
  };
}

/**
 * Build a VPC FlowLog definition that logs to an S3 bucket
 *
 * @param {Object} params
 * @return {Object}
 */
function buildVpcFlowLogs({ name = 'S3FlowLog' } = {}) {
  return {
    [name]: {
      Type: 'AWS::EC2::FlowLog',
      DependsOn: 'LogBucketPolicy',
      Properties: {
        LogDestinationType: 's3',
        LogDestination: {
          'Fn::GetAtt': ['LogBucket', 'Arn'],
        },
        ResourceId: {
          Ref: 'VPC',
        },
        ResourceType: 'VPC',
        TrafficType: 'ALL',
      },
    },
  };
}

module.exports = {
  buildLogBucket,
  buildLogBucketPolicy,
  buildVpcFlowLogs,
};
