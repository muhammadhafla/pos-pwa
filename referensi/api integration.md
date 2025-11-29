Introduction 
Frappe ships with an HTTP API that can be classified into Remote Procedure Calls (RPC), to call whitelisted methods and Representational State Transfer (REST), to manipulate resources.

The base URL is https://{your frappe instance}. Every request shown here should be added to the end of your base URL. For example, if your instance is demo.erpnext.com, GET /api/resource/User means GET https://demo.erpnext.com/api/resource/User.

API v1 
All v1 API endpoints are prefixed with /api/. Starting from Frappe Framework version 15, they can instead be prefixed with /api/v1/.

RPC 
A request to an endpoint /api/method/dotted.path.to.method will call a whitelisted python method.

For example, GET /api/method/frappe.auth.get_logged_user will call this function from frappe's auth module:

@frappe.whitelist()
def get_logged_user():
 return frappe.session.user
Response:

{
 "message": "Administrator"
}
REST 
All documents in Frappe are available via a RESTful API with prefix /api/resource/. You can perform all CRUD operations on them:

Create

You can create a document by sending a POST request to the endpoint, /api/resource/{doctype}.

Read

You can get a document by its name using the endpoint, /api/resource/{doctype}/{name}

Update

You can update a document by sending a PUT request to the endpoint, /api/resource/{doctype}/{name}. This acts like a PATCH HTTP request in which you do not have to send the whole document but only the parts you want to change.

Delete

You can delete a document by its name by sending a DELETE request to the endpoint, /api/resource/{doctype}/{name}.

API v2 
API v2 is available starting from Frappe Framework v15

All v2 API endpoints are prefixed with /api/v2/.

RPC v2 
Similar to v1, RPC endpoints are available at /api/v2/method/ prefix. The following endpoints are available:

/api/v2/method/login - Handle user login (implicit)
/api/v2/method/logout - Log out current user
/api/v2/method/ping - Check server status
/api/v2/method/upload_file - Upload a file
/api/v2/method/dotted.path.to.method - Call any whitelisted method
/api/v2/method/<doctype>/<method> - Call whitelisted method from doctype controller
/api/v2/method/run_doc_method - Run a whitelisted method on a document
REST v2 
API v2 provides a more RESTful interface with the prefix /api/v2/document/ and /api/v2/doctype/. The following operations are supported:

Document Operations 
Create

Create a document by sending a POST request to /api/v2/document/{doctype}

Read

Get a document by sending a GET request to /api/v2/document/{doctype}/{name}/

Update

Update a document by sending a PATCH or PUT request to /api/v2/document/{doctype}/{name}/

Delete

Delete a document by sending a DELETE request to /api/v2/document/{doctype}/{name}/

Copy

Get a clean copy of a document by sending a GET request to /api/v2/document/{doctype}/{name}/copy

Execute Method

Execute a method on a document by sending a GET or POST request to /api/v2/document/{doctype}/{name}/method/{method}

Common values for method: add_comment?text=hello, submit, cancel, rename?name=newname.

DocType Operations 
Get Metadata

Get doctype metadata by sending a GET request to /api/v2/doctype/{doctype}/meta

Get Count

Get total count of records by sending a GET request to /api/v2/doctype/{doctype}/count

List Documents

List documents by sending a GET request to /api/v2/document/{doctype}. Supports pagination and field selection through query parameters.

Simple Authentication 
POST /api/method/login 
Content-Type: application/x-www-form-urlencoded

Params (in body):

usr (string)

Username

pwd (string)

Password

Example:

curl -X POST https://{your frappe instance}/api/method/login \
 -H 'Content-Type: application/json' \
 -H 'Accept: application/json' \
 -d '{"usr":"Administrator","pwd":"admin"}'
Returns:

HTTP Code: 200
application/json:
 {
 "home_page": "/desk",
 "full_name": "Administrator",
 "message": "Logged in"
 }
Cookie: sid (send this to authenticate future requests). Expires in three days.
 sid=05d8d46aaebff1c87a90f570a3ff1c0f570a3ff1c87a90f56bacd4;
 path=/;
 domain=.{your frappe instance};
 Expires=Sat, 29 Sep 2018 00:59:54 GMT;
Error:

HTTP Code: 401
text/html: Wrong password or username.
GET /api/method/logout 
Example:

 curl -X GET https://{your frappe instance}/api/method/logout
Returns:

HTTP Code: 200
application/json: {}
GET /api/method/frappe.auth.get\logged\user 
Get the ID of the currently authenticated user.

Example:

 curl -X GET https://{your frappe instance}/api/method/frappe.auth.get_logged_user
Returns:

HTTP Code: 200
application/json:
 {
 "message": "Administrator"
 }
Author: Raffael Meyer (raffael@alyf.de)

Token Based Authentication 
Available starting with v11.0.3

The HTTP Authorization request header contains the credentials to authenticate a user with a server. It consists of the authorization type (token or Basic) and the corresponding token.

Authorization: <type> <token>
The token consists of api-key and api-secret joined by a colon.

Generating API Key and API Secret 
Go to User list and open a user.
Click on the "Settings" tab. (skip this step if you don't see tabs)
Expand the API Access section and click on Generate Keys.
You will get a popup with the API Secret. Copy this value and keep it somewhere safe (Password Manager).
You will also see another field "API Key" in this section.
Now, using these two keys you can authenticate your API requests. Every request you make with these keys will be logged against the user you selected in Step 1. This also means that roles will be checked against this user. You can also create a new user just for API calls.

Token 
HTTP header:

Authorization: token <api_key>:<api_secret>

Example in python:

import requests

url = "http://frappe.local:8000/api/method/frappe.auth.get_logged_user"
headers = {
    'Authorization': "token <api_key>:<api_secret>"
}
response = requests.request("GET", url, headers=headers)

Basic 
If the "Basic" authentication scheme is used, the credentials are a combination of api_key and api_secret and are constructed like this:

The values are combined with a colon <api_key>:<api_secret>
The resulting string is base64 encoded. base64encode(<api_key>:<api_secret>)
HTTP header:

Authorization: Basic base64encode("<api_key>:<api_secret>")

Example in python:

import requests
import base64

url = "http://frappe.local:8000**/api/method/frappe.auth.get_logged_user**"
headers = {
    'Authorization': "Basic %s" % base64.b64encode(<api_key>:<api_secret>)
}
response = requests.request("GET", url, headers=headers)

Access Token 
If the OAuth 2 Access Token is used to authenticate request, the token is opaque access_token string provided by Frappe Server after setting up OAuth 2 and generating token. Check Guides / Integration / How To Use OAuth 2

HTTP header:

Authorization: Bearer access_token

Example in python:

import requests
import base64

url = "http://frappe.local:8000**/api/method/frappe.auth.get_logged_user**"
headers = {
    "Authorization": "Bearer %s" % access_token
}
response = requests.request("GET", url, headers=headers)

OAuth 2 
Use the header Authorization: Bearer <access_token> to perform authenticated requests. You can receive a bearer token by combining the following two requests.

Here is an amazing introduction to OAuth: OAuth 2.0 and OpenID Connect (in plain English)

GET /api/method/frappe.integrations.oauth2.authorize 
Get an authorization code from the user to access ERPNext on his behalf.

Params (in query):

client_id (string)

ID of your OAuth2 application

state (string)

Arbitrary value used by your client application to maintain state between the request and callback. The authorization server includes this value when redirecting the user-agent back to the client. The parameter should be used for preventing cross-site request forgery.

response_type (string)

"code"

scope (string)

The scope of access that should be granted to your application.

redirect_uri (string)

Callback URI that the user will be redirected to, after the application is authorized. The authorization code can then be extracted from the params.

code_challenge_method (string)

(OPTIONAL) Can be one from s256 or plain.

code_challenge (string)

(OPTIONAL) Can be base64encode(sha256(random_string)) in case code_challenge_method=s256 or random_string in case code_challenge_method=plain. Refer https://tools.ietf.org/html/rfc7636#appendix-A

Example:

curl -X POST https://{your frappe instance}/api/method/frappe.integrations.oauth2.authorize \
 --data-urlencode 'client_id=511cb2ac2d' \
 --data-urlencode 'state=444' \
 # base64encode(sha256('420')) => 21XaP8MJjpxCMRxgEzBP82sZ73PRLqkyBUta1R309J0
 # --data-urlencode 'code_verifier=21XaP8MJjpxCMRxgEzBP82sZ73PRLqkyBUta1R309J0' \
 --data-urlencode 'response_type=code'
 --data-urlencode 'scope=openid%20all' \
 --data-urlencode 'redirect_uri=https://app.getpostman.com/oauth2/callback'
Returns:

HTTP Code: 200
text/html

This will open the authorize page which then redirects you to the redirect_uri.

If the user clicks 'Allow', the redirect URI will be called with an authorization code in the query parameters:

https://{redirect uri}?code=plkj2mqDLwaLJAgDBAkyR1W8Co08Ud&state=444

If user clicks 'Deny' you will receive an error:

https://{redirect uri}?error=access_denied

Token Exchange for Authorization Code Grant with ID Token 
POST /api/method/frappe.integrations.oauth2.get_token
Header Content-Type: application/x-www-form-urlencoded
Note: This endpoint can also be used to get a refreshed access token. Just send the refresh_token in the request body.

Trade the authorization code (obtained above) for an access token.

Params (in body):

grant_type (string)

"authorization_code"

code (string)

Authorization code received in redirect URI.

client_id (string)

ID of your OAuth2 application

redirect_uri (string)

Registered redirect URI of client app

Example:

curl -X POST https://{your frappe instance}/api/method/frappe.integrations.oauth2.get_token \
 -H 'Content-Type: application/x-www-form-urlencoded' \
 -H 'Accept: application/json' \
 -d 'grant_type=authorization_code&code=wa1YuQMff2ZXEAu2ZBHLpJRQXcGZdr
 &redirect_uri=https%3A%2F%2Fapp.getpostman.com%2Foauth2%2Fcallback&client_id=af615c2d3a'
For testing purposes you can also pass the parameters in the URL like this (and open it in the browser):

https://{your frappe instance}/api/method/frappe.integrations.oauth2.get_token?grant_type=authorization_code&code=A1KBRoYAN1uxrLAcdGLmvPKsRQLvzj&client_id=511cb2ac2d&redirect_uri=https%3A%2F%2Fapp.getpostman.com%2Foauth2%2Fcallback

Returns:

 {
 "access_token": "pNO2DpTMHTcFHYUXwzs74k6idQBmnI",
 "token_type": "Bearer",
 "expires_in": 3600,
 "refresh_token": "cp74cxbbDgaxFuUZ8Usc7egYlhKbH1",
 "scope": "openid all",
 "id_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.XbPfbIHMI6arZ3Y922BhjWgQzWXcXNrz0ogtVhfEd2o"
 }
Token Exchange for Authorization Code Grant with ID Token (PKCE) 
POST /api/method/frappe.integrations.oauth2.get_token
Header Content-Type: application/x-www-form-urlencoded
Trade the authorization code (obtained above) for an access token.

Params (in body):

grant_type (string)

"authorization_code"

code (string)

Authorization code received in redirect URI.

client_id (string)

ID of your OAuth2 application

redirect_uri (string)

Registered redirect URI of client app

code_verifier (string)

random_string used during Authorization Request with code_challenge_method and code_challenge.

Content-Type: application/x-www-form-urlencoded

Example:

curl -X POST https://{your frappe instance}/api/method/frappe.integrations.oauth2.get_token \
 -H 'Content-Type: application/x-www-form-urlencoded' \
 -H 'Accept: application/json' \
 -d 'grant_type=authorization_code&code=wa1YuQMff2ZXEAu2ZBHLpJRQXcGZdr
 &redirect_uri=https%3A%2F%2Fapp.getpostman.com%2Foauth2%2Fcallback&client_id=af615c2d3a&code_verifier=420'
For testing purposes you can also pass the parameters in the URL like this (and open it in the browser):

https://{your frappe instance}/api/method/frappe.integrations.oauth2.get_token?grant_type=authorization_code&code=A1KBRoYAN1uxrLAcdGLmvPKsRQLvzj&client_id=511cb2ac2d&redirect_uri=https%3A%2F%2Fapp.getpostman.com%2Foauth2%2Fcallback&code_verifier=420

Returns:

{
 "access_token": "pNO2DpTMHTcFHYUXwzs74k6idQBmnI",
 "token_type": "Bearer",
 "expires_in": 3600,
 "refresh_token": "cp74cxbbDgaxFuUZ8Usc7egYlhKbH1",
 "scope": "openid all",
 "id_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.XbPfbIHMI6arZ3Y922BhjWgQzWXcXNrz0ogtVhfEd2o"
}
Revoke Token Endpoint 
POST /api/method/frappe.integrations.oauth2.revoke_token
Header: Content-Type: application/x-www-form-urlencoded
Revoke token endpoint.

Params:

token

Access token to be revoked.

Returns:

Always returns empty response with HTTP status code 200.

 {}
Open ID Connect id_token 
ID Token is a JWT.

aud claim has registered client_id.
iss claim has frappe server url.
sub claim has Frappe User's userid.
roles claim has user roles.
exp claim has expiration time.
iat claim has issued at time.
Example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkouIERvZSIsImVtYWlsIjoiakBkb2UuY29tIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyNDIwMjIsImF1ZCI6ImNsaWVudF9pZCJ9.ZEdnrHjLbArahVTN19b4zoRFoBO5a2BakRkR82O1VU8

Verify and extract it with PyJWT.

import jwt

id_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkouIERvZSIsImVtYWlsIjoiakBkb2UuY29tIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyNDIwMjIsImF1ZCI6ImNsaWVudF9pZCIsInJvbGVzIjpbIlN5c3RlbSBNYW5hZ2VyIiwiU2FsZXMgTWFuYWdlciJdLCJub25jZSI6Ijc4OTEyMyIsImlzcyI6Imh0dHBzOi8vZXJwLmV4YW1wbGUuY29tIn0.F8Wbh5dtD1loZPltJLj_sqF9DZNeBvEbo-ITtf3UPqk"

client_id = 'client_id'
client_secret = 'client_secret'

payload = jwt.decode(
 id_token,
 audience=client_id,
 key=client_secret,
 algorithm="HS256",
 options={"verify_exp": False}, # Enabled by default to verify expiration time
)

print(payload)
# Output

{'sub': '1234567890', 'name': 'J. Doe', 'email': 'j@doe.com', 'iat': 1516239022, 'exp': 1516242022, 'aud': 'client_id', 'roles': ['System Manager', 'Sales Manager'], 'nonce': '789123', 'iss': 'https://erp.example.com'}
OpenID User Info Endpoint 
Request

GET /api/method/frappe.integrations.oauth2.openid_profile
Header: Authorization: Bearer valid_access_token
Response

{
 "sub": "1234567890",
 "name": "J. Doe",
 "given_name": "J",
 "family_name": "Doe",
 "iss": "https://erp.example.com",
 "picture": "https://erp.example.com/files/jdoe.jpg",
 "email": "j@doe.com",
 "iat": 1516239022,
 "exp": 1516242022,
 "aud": "client_id",
 "roles": ["System Manager", "Sales Manager"]
}
Introspect Token Endpoint 
POST /api/method/frappe.integrations.oauth2.introspect_token
Header: Content-Type: application/x-www-form-urlencoded
Revoke token endpoint.

Params:

token_type_hint

access_token or refresh_token, defaults to access_token if nothing is provided

token

Access token or Refresh Token to be introspected. Depends on token_type_hint

Returns:

{
 "client_id": "511cb2ac2d",
 "trusted_client": 1,
 "active": true,
 "exp": 1619523326,
 "scope": "openid all",
 "sub": "1234567890",
 "name": "J. Doe",
 "given_name": "J",
 "family_name": "Doe",
 "iss": "https://erp.example.com",
 "picture": "https://erp.example.com/files/jdoe.jpg",
 "email": "j@doe.com",
 "iat": 1516239022,
 "exp": 1516242022,
 "aud": "511cb2ac2d",
 "roles": ["System Manager", "Sales Manager"]
}
OR

{
 "active": false,
 "_server_messages": "..."
}
Further Reading 
Please check Guides / Integration / How To Set Up Oauth to see how to create a new OAuth 2 client.

Content-Type Header,
Authorization Header,
OAuth 2 Specification,
Bearer token.
Authors:

Raffael Meyer (raffael@alyf.de)
Revant Nandgaonkar (revant@castlecraft.in)

Listing documents 
To list documents, make a GET request to /api/resource/{doctype}.

GET /api/resource/Person

All listings are returned paginated by 20 items. To change the page size, you can pass the query parameter limit_page_length. To request succesive pages, pass limit_start.

The response is returned as JSON Object and the listing is an array in with the key data.

Response:

{
 "data": [
 {
 "name": "000000012"
 },
 {
 "name": "000000008"
 }
 ]
}
By default, only the name field is included in the listing. To add more fields, you can pass the fields parameter with your GET request. fields has to be a JSON array containing the fieldnames.

GET /api/resource/Person/?fields=["name","first_name"]

Response:

{
 "data": [
 {
 "first_name": "Jane",
 "name": "000000012"
 },
 {
 "first_name": "John",
 "name": "000000008"
 }
 ]
}
You can filter the listing using SQL-conditions by passing the query parameter filters. filters has to be a JSON array containing one or multiple filters. Each condition is an array of the format, [{doctype}, {field}, {operator}, {operand}].

For example, get the name (id) of all persons with firstname "Jane":

GET /api/resource/Person?filters=[["Person","first_name","=","Jane"]]

Response:

 { "data": [ { "name": "000000012" } ] }
Authors: Rushabh Mehta (rushabh@erpnext.com), Raffael Meyer (raffael@alyf.de)

Manipulating DocTypes 
A DocTypes is a specific type of document, for example: Customer, Employee or Item.

A DocumentName is the unique ID of a Document, for example: CUST-00001, EMP-00001 or ITEM-00001.

Authentication is missing in the following examples. See [Basic Authentication] and [OAuth2] for more.

GET /api/resource/{DocType} 
Get a list of documents of this DocType.

Params (in path):

DocType (string)

The DocType you'd like to receive. For example, 'Customer'.

Params (in query):

fields []

By default, only the 'name' field will be returned. To add more fields, you can pass the fields parameter. For example, fields=["name","country"]

filters [[(string)]]

You can filter the listing using SQL conditions by passing them in the filters parameter. Each condition is an array of the format, [{doctype}, {field}, {operator}, {value}]. For example, filters=[["Customer", "country", "=", "India"]]

limit_page_length (int)

All listings will be paginated. With this parameter you can change the page size (how many items are teturned at once). Default: 20.

limit_start (int)

To request successive pages, pass a multiple of your limit_page_length as limit_start. For example, to request the second page, pass limit_start as 20.

Example:

Get at most 20 Names (IDs) of all Customers whose phone number is 4915227058038.

curl -X GET https://{your frappe instance}/api/resource/Customer?fields=["name"]\
 &filters=[["Customer","phone","=","4915227058038"]]
Returns:

 {
 "data": [
 {
 "name": "CUST-00001"
 },
 ]
 }
POST /api/resource/{DocType} 
Create a new document of this DocType.

Params (in path):

DocType (string)

The DocType you'd like to create. For example, 'Customer'.

Content-Type: application/json

Request Body: {"fieldname": value}

Example:

Create a new Lead named Mustermann.

curl -X POST https://{your frappe instance}/api/resource/Lead \
 -H 'Content-Type: application/json' \
 -H 'Accept: application/json' \
 -d '{"lead_name":"Mustermann"}'
GET /api/resource/{DocType}/{DocumentName} 
Retrieve a specific document by name (ID).

Params (in path):

DocType (string)

The type of the document you'd like to get. For example, 'Customer'.

DocumentName (string)

The name (ID) of the document you'd like to get. For example, 'EMP-00001'.

Example:

Get the Customer with Name (ID) CUST-00001.

curl -X GET https://{your frappe instance}/api/resource/Customer/CUST-00001
PUT /api/resource/{DocType}/{DocumentName} 
Update a specific document. This acts like a PATCH HTTP request in which you do not have to send the whole document but only the parts you want to change.

Params (in path):

DocType (string)

The type of the document you'd like to update. For example, 'Customer'.

DocumentName (string)

The name (ID) of the document you'd like to update. For example, 'EMP-00001'.

Content-Type: application/json

Request Body: {"fieldname": value}

Example:

Update Next Contact Date.

curl -X PUT https://{your frappe instance}/api/resource/Lead/LEAD-00001 \
 -H 'Accept: application/json' \
 -H 'Content-Type: application/json' \
 -d '{"contact_date":"2018-10-08"}'
Returns:

{
 "data": {
 "doctype": "Lead",
 "name": "LEAD-00001",
 "contact_date": "2018-10-08",
 "...": "..."
 }
}
DELETE /api/resource/{DocType}/{DocumentName} 
Params (in path):

DocType (string)

The type of the document you'd like to delete. For example, 'Customer'.

DocumentName (string)

The name (ID) of the document you'd like to delete. For example, 'EMP-00001'.

Further Reading 
HTTP Headers:

Content-Type
Accept
Authorization