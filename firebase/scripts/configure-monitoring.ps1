$ErrorActionPreference = 'Stop'
$releaseProject = 'studio-285787437-bc95b'
$releaseAccessToken = & gcloud auth print-access-token
if ($LASTEXITCODE -ne 0) { throw 'Google Cloud login required' }
$releaseHeaders = @{ Authorization = "Bearer $releaseAccessToken"; 'x-goog-user-project' = $releaseProject }
$releaseMonitoring = "https://monitoring.googleapis.com/v3/projects/$releaseProject"
function Read-ReleaseApi($uri) { Invoke-RestMethod -Headers $releaseHeaders -Uri $uri }
function Write-ReleaseApi($uri, $body) { Invoke-RestMethod -Method Post -Headers $releaseHeaders -ContentType 'application/json' -Uri $uri -Body ($body | ConvertTo-Json -Depth 20) }

$releaseChannels = Read-ReleaseApi "$releaseMonitoring/notificationChannels"
$releaseChannel = $releaseChannels.notificationChannels | Where-Object { $_.type -eq 'email' -and $_.labels.email_address -eq 'brandontinoz@gmail.com' } | Select-Object -First 1
if (-not $releaseChannel) { $releaseChannel = Write-ReleaseApi "$releaseMonitoring/notificationChannels" @{ type='email'; displayName='Vehicle Import production support'; labels=@{email_address='brandontinoz@gmail.com'}; enabled=$true } }
$releasePolicies = Read-ReleaseApi "$releaseMonitoring/alertPolicies"
if (-not ($releasePolicies.alertPolicies | Where-Object displayName -eq 'Vehicle Import backend errors')) {
  $releasePolicy = Write-ReleaseApi "$releaseMonitoring/alertPolicies" @{
    displayName='Vehicle Import backend errors'; enabled=$true; combiner='OR'; notificationChannels=@($releaseChannel.name)
    conditions=@(@{displayName='Production backend error'; conditionMatchedLog=@{filter='severity>=ERROR AND (resource.type="cloud_run_revision" OR resource.type="cloud_function")'}})
    alertStrategy=@{notificationRateLimit=@{period='3600s'};autoClose='604800s'}
    documentation=@{content='Contact brandontinoz@gmail.com. Inspect Firebase function logs, identify the affected agency/case, preserve audit history, and consult OPERATIONS_RUNBOOK.md before retrying financial actions.';mimeType='text/markdown'}
  }
}
$releaseChecks = Read-ReleaseApi "$releaseMonitoring/uptimeCheckConfigs"
if (-not ($releaseChecks.uptimeCheckConfigs | Where-Object displayName -eq 'Vehicle Import public portal')) {
  $releaseCheck = Write-ReleaseApi "$releaseMonitoring/uptimeCheckConfigs" @{ displayName='Vehicle Import public portal'; monitoredResource=@{type='uptime_url';labels=@{project_id=$releaseProject;host="$releaseProject.web.app"}}; httpCheck=@{path='/';port=443;useSsl=$true;validateSsl=$true};period='300s';timeout='10s' }
}
if (-not ($releasePolicies.alertPolicies | Where-Object displayName -eq 'Vehicle Import portal unavailable')) {
  $releaseUptimePolicy = Write-ReleaseApi "$releaseMonitoring/alertPolicies" @{
    displayName='Vehicle Import portal unavailable'; enabled=$true; combiner='OR'; notificationChannels=@($releaseChannel.name)
    conditions=@(@{displayName='Public HTTPS checks failing';conditionThreshold=@{filter='resource.type="uptime_url" AND metric.type="monitoring.googleapis.com/uptime_check/check_passed"';comparison='COMPARISON_LT';thresholdValue=0.5;duration='300s';aggregations=@(@{alignmentPeriod='300s';perSeriesAligner='ALIGN_FRACTION_TRUE';crossSeriesReducer='REDUCE_MEAN';groupByFields=@('resource.label.host')});trigger=@{count=1}}})
    alertStrategy=@{autoClose='604800s'}
  }
}
$releaseBilling = Read-ReleaseApi "https://cloudbilling.googleapis.com/v1/projects/$releaseProject/billingInfo"
$releaseBudgetBase = "https://billingbudgets.googleapis.com/v1/$($releaseBilling.billingAccountName)/budgets"
$releaseBudgets = Read-ReleaseApi $releaseBudgetBase
if (-not ($releaseBudgets.budgets | Where-Object displayName -eq 'Vehicle Import pilot monthly cost alert')) {
  $releaseBudget = Write-ReleaseApi $releaseBudgetBase @{displayName='Vehicle Import pilot monthly cost alert';budgetFilter=@{projects=@('projects/361047726956');calendarPeriod='MONTH'};amount=@{specifiedAmount=@{currencyCode='USD';units='25'}};thresholdRules=@(@{thresholdPercent=0.5},@{thresholdPercent=0.8},@{thresholdPercent=1.0});notificationsRule=@{monitoringNotificationChannels=@($releaseChannel.name);disableDefaultIamRecipients=$false}}
}
Write-Output 'Production email error alerts, uptime check and USD 25 monthly budget alerts configured. Budget alerts do not cap spending.'
