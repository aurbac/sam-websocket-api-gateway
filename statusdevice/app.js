// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });

const { TABLE_NAME } = process.env;
const { TABLE_NAME_DEVICES } = process.env;

exports.handler = async (event, context) => {

  console.log(JSON.stringify(event, null, 2));
  event.Records.forEach(function(record) {
      console.log(record.eventID);
      console.log(record.eventName);
      console.log('DynamoDB Record: %j', record.dynamodb);
  });
  
  /*
  let statusData;
  try {
    statusData = await ddb.query({ TableName: TABLE_NAME_DEVICES, KeyConditionExpression: 'deviceId = :deviceId', ExpressionAttributeValues: { ':deviceId': 'my_device' }  }).promise();
    
  } catch (e) {
    console.log(e);
    console.log("Error 1");
    return { statusCode: 500, body: e.stack };
  }
  */
  
  let connectionData;
  
  try {
    connectionData = await ddb.scan({ TableName: TABLE_NAME, ProjectionExpression: 'connectionId,domainName,stage' }).promise();
  } catch (e) {
    console.log("Error 2");
    return { statusCode: 500, body: e.stack };
  }
  /*
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });
  
  const postData = JSON.parse(event.body).data;
  */
  //console.log(JSON.stringify(statusData, null, 2));
  console.log(JSON.stringify(connectionData, null, 2));
  
  let message_to_send = event.Records[0].dynamodb.NewImage.status.BOOL.toString();
  
  const postCalls = connectionData.Items.map(async ({ connectionId, domainName, stage }) => {
    try {
      console.log("-----");
      console.log(connectionId);
      console.log(domainName);
      console.log(stage);
      console.log("-----");
      const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: domainName + '/' + stage
      });
      console.log(message_to_send);
      await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: message_to_send }).promise();
    } catch (e) {
      console.log("Error 3");
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        //await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });
  
  
  
  try {
    await Promise.all(postCalls);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  
  return { statusCode: 200, body: 'Data sent.' };
};
