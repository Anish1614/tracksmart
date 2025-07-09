variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "lambda_s3_bucket" {
  description = "S3 bucket where the Lambda ZIP is uploaded"
  type        = string
}

variable "lambda_s3_key" {
  description = "S3 key (path) for the Lambda ZIP"
  type        = string
}