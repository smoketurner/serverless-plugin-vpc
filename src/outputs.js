const { VALID_SUBNET_GROUPS } = require('./constants');

/**
 * Append subnets to output
 *
 * @param {Array<Object>} subnets
 * @param {Object} outputs
 */
function appendSubnets(subnets, outputs) {
  const subnetOutputs = subnets.map((subnet) => ({
    [`${subnet.Ref}`]: {
      Value: subnet,
    },
  }));

  Object.assign(outputs, ...subnetOutputs);
}

/**
 * Append subnet groups to output
 *
 * @param {Array<String>} subnetGroups
 * @param {Object} outputs
 */
function appendSubnetGroups(subnetGroups, outputs) {
  const typesToNames = {
    rds: 'RDSSubnetGroup',
    redshift: 'RedshiftSubnetGroup',
    elasticache: 'ElastiCacheSubnetGroup',
    dax: 'DAXSubnetGroup',
  };

  const subnetGroupOutputs = subnetGroups.map((subnetGroup) => ({
    [typesToNames[subnetGroup]]: {
      Description: `Subnet Group for ${subnetGroup}`,
      Value: {
        Ref: typesToNames[subnetGroup],
      },
    },
  }));

  Object.assign(outputs, ...subnetGroupOutputs);
}

/**
 * Append bastion host to output
 *
 * @param {Object} outputs
 */
function appendBastionHost(outputs) {
  // eslint-disable-next-line no-param-reassign
  outputs.BastionSSHUser = {
    Description: 'SSH username for the Bastion host',
    Value: 'ec2-user',
  };
  // eslint-disable-next-line no-param-reassign
  outputs.BastionEIP = {
    Description: 'Public IP of Bastion host',
    Value: {
      Ref: 'BastionEIP',
    },
  };
}

/**
 * Append export outputs
 *
 * @param {Boolean} exportOutputs
 * @param {Object} outputs
 */
function appendExports(outputs) {
  Object.entries(outputs).forEach(([name, value]) => {
    // eslint-disable-next-line no-param-reassign
    value.Export = {
      Name: {
        'Fn::Join': ['-', [{ Ref: 'AWS::StackName' }, name]],
      },
    };
  });
}

/**
 * Build CloudFormation Outputs on common resources
 *
 * @param {Boolean} createBastionHost
 * @param {Array<String>} subnetGroups
 * @param {Array<String>} subnets
 * @param {Boolean} exportOutputs
 * @return {Object}
 */

function buildOutputs({
  createBastionHost = false,
  subnetGroups = VALID_SUBNET_GROUPS,
  subnets = [],
  exportOutputs = false,
} = {}) {
  const outputs = {
    VPC: {
      Description: 'VPC logical resource ID',
      Value: {
        Ref: 'VPC',
      },
    },
    LambdaExecutionSecurityGroupId: {
      Description:
        'Security Group logical resource ID that the Lambda functions use when executing within the VPC',
      Value: {
        Ref: 'LambdaExecutionSecurityGroup',
      },
    },
  };

  // subnet groups need at least 2 subnets
  if (Array.isArray(subnets) && subnets.length > 1) {
    appendSubnetGroups(subnetGroups, outputs);
  }

  if (Array.isArray(subnets) && subnets.length > 0) {
    appendSubnets(subnets, outputs);
  }

  if (createBastionHost) {
    appendBastionHost(outputs);
  }

  if (exportOutputs) {
    appendExports(outputs);
  }

  return outputs;
}

module.exports = {
  buildOutputs,
};
