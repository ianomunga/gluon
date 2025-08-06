// lib/awsEc2Signer.js
import crypto from 'crypto'
import { URLSearchParams } from 'url'

function hmac(key, str) {
  return crypto.createHmac('sha256', key).update(str, 'utf8').digest()
}

function hash(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex')
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmac(`AWS4${key}`, dateStamp)
  const kRegion = hmac(kDate, regionName)
  const kService = hmac(kRegion, serviceName)
  const kSigning = hmac(kService, 'aws4_request')
  return kSigning
}

export async function getSignedAwsEc2Request({
  method = 'POST',
  region = 'us-east-1',
  accessKeyId,
  secretAccessKey,
  service = 'ec2',
  action = '',
  bodyParams = {}
}) {
  const endpoint = `https://${service}.${region}.amazonaws.com/`

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const headers = {
    Host: `${service}.${region}.amazonaws.com`,
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    'X-Amz-Date': amzDate
  }

  const params = new URLSearchParams({
    Action: action,
    Version: '2016-11-15',
    ...bodyParams
  })

  const payload = params.toString()
  const canonicalUri = '/'
  const canonicalQuerystring = ''
  const canonicalHeaders = `content-type:${headers['Content-Type']}\nhost:${headers.Host}\nx-amz-date:${headers['X-Amz-Date']}\n`
  const signedHeaders = 'content-type;host;x-amz-date'
  const payloadHash = hash(payload)

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')

  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    hash(canonicalRequest)
  ].join('\n')

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service)
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    url: endpoint,
    headers: {
      ...headers,
      Authorization: authorizationHeader
    },
    body: payload
  }
}
