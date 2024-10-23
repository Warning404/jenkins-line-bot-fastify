// ประกาศตัวแปรนอกบล็อก pipeline
def stageResults = [:]

pipeline {
    agent any
    tools {
        jdk 'jdk-17'
    }

    environment {
        scannerHome = tool 'SonarQubeScanner'
    }

    stages {
        stage('SEND START EVENT') { // Modified stage name
            steps {
                script {
                    // Initialize the stageResults
                    stageResults['SEND START EVENT'] = ['status':'success']
                }
            }
        }
        stage('GIT CHECKOUT') {
            steps {
                script {
                    try {
                        git branch: 'main', credentialsId: 'gitlab_UP', url: ''
                        stageResults['GIT CHECKOUT'] = ['status':'success']
                    } catch (err) {
                        stageResults['GIT CHECKOUT'] = ['status':'failure', 'error': err.toString()]
                        error("GIT CHECKOUT stage failed: ${err}")
                    }
                }
            }
        }

        stage('SONARQUBE ANALYSIS') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    script {
                        withCredentials([string(credentialsId: 'sonarToken', variable: 'SONAR_TOKEN'),
                                         string(credentialsId: 'sonarHostUrl', variable: 'SONAR_HOST_URL')]) {
                            try {
                                sh """
                                ${scannerHome}/bin/sonar-scanner \\
                                -Dsonar.projectKey=approval-workflow-management \\
                                -Dsonar.sources=. \\
                                -Dsonar.host.url=$SONAR_HOST_URL \\
                                -Dsonar.token=$SONAR_TOKEN
                                """
                                stageResults['SONARQUBE ANALYSIS'] = ['status':'success']
                            } catch (err) {
                                stageResults['SONARQUBE ANALYSIS'] = ['status':'failure', 'error': err.toString()]
                                error("SONARQUBE ANALYSIS stage failed: ${err}")
                            }
                        }
                    }
                }
            }
        }

        stage('TRIVY SCAN') {
            steps {
                script {
                    try {
                        sh "trivy fs --scanners vuln /var/jenkins_home/workspace/approval-workflow-management"
                        stageResults['TRIVY SCAN'] = ['status':'success']
                    } catch (err) {
                        stageResults['TRIVY SCAN'] = ['status':'failure', 'error': err.toString()]
                        error("TRIVY SCAN stage failed: ${err}")
                    }
                }
            }
        }

        stage('DOCKER BUILD') {
            steps {
                script {
                    try {
                        withDockerRegistry(credentialsId: 'dockerHub') {
                            sh "docker build -t approval-workflow-management ."
                        }
                        stageResults['DOCKER BUILD'] = ['status':'success']
                    } catch (err) {
                        stageResults['DOCKER BUILD'] = ['status':'failure', 'error': err.toString()]
                        error("DOCKER BUILD stage failed: ${err}")
                    }
                }
            }
        }

        stage('DOCKER PUSH') {
            steps {
                script {
                    try {
                        withDockerRegistry(credentialsId: 'dockerHub') {
                            sh """
                            docker tag approval-workflow-management warning505/approval-workflow-management:v$BUILD_ID
                            docker push warning505/approval-workflow-management:v$BUILD_ID
                            docker tag approval-workflow-management warning505/approval-workflow-management:latest
                            docker push warning505/approval-workflow-management:latest
                            """
                        }
                        stageResults['DOCKER PUSH'] = ['status':'success']
                    } catch (err) {
                        stageResults['DOCKER PUSH'] = ['status':'failure', 'error': err.toString()]
                        error("DOCKER PUSH stage failed: ${err}")
                    }
                }
            }
        }

        stage('DEPLOY K8s') {
            steps {
                script {
                    try {
                        def timestamp = new Date().format("yyyy-MM-dd HH:mm:ss")
                        def deploymentYaml = readFile('deployment.yaml')
                        deploymentYaml = deploymentYaml.replace('REDEPLOY_ANNOTATION', timestamp)
                        writeFile(file: 'deployment.yaml', text: deploymentYaml)
                        kubernetesDeploy(configs: 'deployment.yaml', kubeconfigId: 'kubernetes')
                        stageResults['DEPLOY K8s'] = ['status':'success']
                    } catch (err) {
                        stageResults['DEPLOY K8s'] = ['status':'failure', 'error': err.toString()]
                        error("DEPLOY K8s stage failed: ${err}")
                    }
                }
            }
        }
    }

     post {
        always {
            script {
                def gitlabUserName = env.gitlabUserName ?: 'Unknown User'
                def buildStatus = currentBuild.currentResult
                def buildNumber = env.BUILD_NUMBER
                def jobName = env.JOB_NAME
                def buildUrl = env.BUILD_URL

                // Add build level information to the stageResults
                stageResults['Build Info'] = [
                    'jobName': jobName,
                    'buildNumber': buildNumber,
                    'status': buildStatus,
                    'user': gitlabUserName,
                    'url': buildUrl
                ]

                // Convert stageResults to JSON
                def json = groovy.json.JsonOutput.toJson(stageResults)

                // Write JSON data to a file
                writeFile(file: 'stageResults.json', text: json)

                // Post JSON data using curl
                try {
                    sh """
                    curl -X POST -H 'Content-Type: application/json' -d @stageResults.json  https://2f38-49-230-47-12.ngrok-free.app/push
                    """
                } catch (err) {
                    echo "Failed to post data to  https://2f38-49-230-47-12.ngrok-free.app/push: ${err}"
                }
            }
            cleanWs()
        }
    }
}