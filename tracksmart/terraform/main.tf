# === DynamoDB Table ===
resource "aws_dynamodb_table" "tracks" {
  name         = "TrackSmartData"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "pk"
  range_key = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
}

# === IAM for Lambda ===
resource "aws_iam_role" "lambda_exec" {
  name = "tracksmart_lambda_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action    = "sts:AssumeRole",
      Effect    = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "dynamodb_access" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

# === Lambda Function ===
resource "aws_lambda_function" "beckn_handler" {
  function_name = "tracksmart_beckn"
  handler       = "app.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_exec.arn

  s3_bucket = var.lambda_s3_bucket
  s3_key    = var.lambda_s3_key

  environment {
    variables = {
      TABLE_NAME        = aws_dynamodb_table.tracks.name
      BECKN_GATEWAY_URL = "https://${aws_api_gateway_rest_api.api.id}.execute-api.${var.aws_region}.amazonaws.com/prod"
    }
  }
}

# === API Gateway ===
resource "aws_api_gateway_rest_api" "api" {
  name        = "TrackSmartGateway"
  description = "BECKN protocol gateway + BAP endpoints"
}

resource "aws_api_gateway_resource" "discover" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "discover"
}

resource "aws_api_gateway_resource" "track" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "track"
}

# === Methods ===
resource "aws_api_gateway_method" "discover_post" {
  rest_api_id     = aws_api_gateway_rest_api.api.id
  resource_id     = aws_api_gateway_resource.discover.id
  http_method     = "POST"
  authorization   = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_method" "track_post" {
  rest_api_id     = aws_api_gateway_rest_api.api.id
  resource_id     = aws_api_gateway_resource.track.id
  http_method     = "POST"
  authorization   = "NONE"
  api_key_required = true
}

# === Integrations ===
resource "aws_api_gateway_integration" "discover_integration" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.discover.id
  http_method             = aws_api_gateway_method.discover_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.beckn_handler.invoke_arn
}

resource "aws_api_gateway_integration" "track_integration" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.track.id
  http_method             = aws_api_gateway_method.track_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.beckn_handler.invoke_arn
}

# === Deployment ===
resource "aws_api_gateway_deployment" "deployment" {
  depends_on = [
    aws_api_gateway_integration.discover_integration,
    aws_api_gateway_integration.track_integration
  ]
  rest_api_id = aws_api_gateway_rest_api.api.id
  description = "Deployment for prod"
}

resource "aws_api_gateway_stage" "prod" {
  stage_name    = "prod"
  rest_api_id   = aws_api_gateway_rest_api.api.id
  deployment_id = aws_api_gateway_deployment.deployment.id
}

# === API Key ===
resource "aws_api_gateway_api_key" "key" {
  name    = "tracksmart_key"
  enabled = true
}

# === Usage Plan ===
resource "aws_api_gateway_usage_plan" "usage" {
  name = "TrackSmartUsagePlan"

  api_stages {
    api_id = aws_api_gateway_rest_api.api.id
    stage  = aws_api_gateway_stage.prod.stage_name
  }
}

resource "aws_api_gateway_usage_plan_key" "key" {
  key_id        = aws_api_gateway_api_key.key.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.usage.id
}

# === Lambda Permission for API Gateway ===
resource "aws_lambda_permission" "api_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.beckn_handler.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}
