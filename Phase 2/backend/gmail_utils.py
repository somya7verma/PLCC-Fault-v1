import os.path
import base64
import time
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from email.mime.text import MIMEText

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/gmail.send']

def get_gmail_service():
    """Shows basic usage of the Gmail API.
    Lists the user's Gmail labels.
    """
    creds = None
    # The file token.json stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first
    # time.
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'client_secret_1025055942835-6p26phrkde0c8ini41aj59v6v09dcskv.apps.googleusercontent.com.json', SCOPES)
            creds = flow.run_local_server(port=8080)
        # Save the credentials for the next run
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    service = build('gmail', 'v1', credentials=creds)
    return service

def send_single_email(service, to_email, subject, body):
    """Send a single email."""
    try:
        message = MIMEText(body)
        message['to'] = to_email
        message['subject'] = subject
        create_message = {'raw': base64.urlsafe_b64encode(message.as_bytes()).decode()}

        message = (service.users().messages().send(userId="me", body=create_message).execute())
        print(f'Sent email to {to_email} Message Id: {message["id"]}')
        return message
    except Exception as error:
        print(f'An error occurred sending to {to_email}: {error}')
        return None

def send_emails_sequentially(service, recipients, subject, body, delay=3):
    """Send emails one by one with a delay."""
    if not recipients:
        print("No recipients.")
        return

    print(f"Sending emails to {len(recipients)} recipients...")
    
    for i, email in enumerate(recipients):
        print(f"Sending to {email} ({i+1}/{len(recipients)})...")
        send_single_email(service, email, subject, body)
