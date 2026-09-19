# Home Screen API Reference

## Overview
Ye file `HomeScreen` ke liye zaroori backend API endpoints ko list karti hai. Isse aap samajh sakte hain kaunsa endpoint home screen pe job list, driver stats, aur notifications ke liye use hoga.

Base URL: `https://api.deliveryplus.tech/api`

---

## 1. Driver Profile / Current User

### Endpoint
`GET /auth/me`

### Purpose
- Logged-in driver ka profile data laata hai.
- Home screen mein driver name, phone, role, aur profile info dikhane ke liye.

### Auth
`Authorization: Bearer <accessToken>`

### Expected response shape
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "user": {
      "_id": "69f83d5792669e1add0e605e",
      "name": "Shivam",
      "email": "shivam@gmail.com",
      "role": "driver",
      "phone": "9876543210",
      "isActive": true,
      "createdAt": "2026-05-04T06:31:51.510Z",
      "updatedAt": "2026-05-04T06:52:52.633Z",
      "lastLogin": "2026-05-04T06:52:52.633Z",
      "__v": 0
    }
  }
}
```

---

## 2. Today’s Jobs

### Endpoint
`GET /jobs/driver/today`

### Purpose
- Home screen ke `Today's Jobs` list ko populate karne ke liye.
- Ye endpoint driver ke liye aaj ke scheduled jobs return karega.

### Auth
`Authorization: Bearer <accessToken>`

### Expected response shape
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "jobs": [
      {
        "_id": "6431...",
        "jobNumber": "JOB-00001",
        "customerName": "Amit Sharma",
        "customerPhone": "9876543210",
        "pickupAddress": "Connaught Place",
        "dropAddress": "Gurgaon Sector 45",
        "jobType": "delivery",
        "status": "assigned",
        "scheduledDate": "2026-05-04T00:00:00.000Z",
        "scheduledTime": "10:00 AM",
        "billing": {
          "totalAmount": 450
        },
        "assignedVehicle": {
          "_id": "...",
          "name": "...",
          "type": "...",
          "registration": "..."
        }
      }
    ]
  }
}
```

### Notes
- Backend mein `distance` field nahi hai, isliye agar UI mein distance chahiye toh client side calculate karna padega ya backend mein add karna hoga.
- `jobNumber` ko display ID ke liye use karo.
- `job._id` ko job detail fetch aur navigation ke liye store karo.

---

## 3. Driver Job List

### Endpoint
`GET /jobs/driver/my-jobs`

### Purpose
- Driver ke saare assigned jobs load karne ke liye.
- Home screen mein overall job list ya upcoming jobs dikhane ke liye.

### Optional query parameters
- `status=completed`
- `status=in_transit`
- `status=assigned`
- `status=started`

### Expected response shape
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "jobs": [ ... ]
  }
}
```

---

## 4. Completed Jobs / Earnings

### Endpoint
`GET /jobs/driver/my-jobs?status=completed`

### Purpose
- Completed jobs count nikalne ke liye.
- Home screen statistics mein completed jobs aur earnings calculate karne ke liye.

### Notes
- `billing.totalAmount` job object mein available hota hai.
- Earnings ka total client side calculate kare: sum of `billing.totalAmount`.

---

## 5. Active Jobs Count

### Endpoint
`GET /jobs/driver/my-jobs?status=in_transit`

### Purpose
- Active delivery count ya `In Transit` stat dikhane ke liye.

### Notes
- Agar `started` status ko bhi active maana ho, toh additional call use karein:
  `GET /jobs/driver/my-jobs?status=started`

---

## 6. Dashboard / Aggregated Stats

### Backend status
- Iss backend codebase mein `GET /driver/dashboard` endpoint defined nahi hai.
- Isliye consolidated dashboard endpoint abhi available nahi hai.

### Recommendation
- Agar chahiye toh naya endpoint add karo jo ek hi request mein:
  - profile
  - today’s jobs
  - completed jobs count
  - earnings
  - active jobs count
  return kare.

---

## 7. Notifications

### Backend status
- `Notification` model available hai.
- Lekin current codebase mein `GET /notifications` route defined nahi hai.

### Recommendation
- Agar home screen bell / unread notifications chahiye, backend mein naya route banana padega:
  - `GET /notifications`
  - `GET /notifications/unread`
  - `POST /notifications/read/:id`

---

## Example cURL Requests

### Get current driver profile
```bash
curl -X GET "https://api.deliveryplus.tech/api/auth/me" \
  -H "Authorization: Bearer <accessToken>"
```

### Get today’s jobs
```bash
curl -X GET "https://api.deliveryplus.tech/api/jobs/driver/today" \
  -H "Authorization: Bearer <accessToken>"
```

### Get completed jobs
```bash
curl -X GET "https://api.deliveryplus.tech/api/jobs/driver/my-jobs?status=completed" \
  -H "Authorization: Bearer <accessToken>"
```

### Get active in-transit jobs
```bash
curl -X GET "https://api.deliveryplus.tech/api/jobs/driver/my-jobs?status=in_transit" \
  -H "Authorization: Bearer <accessToken>"
```

---

## Recommended Data Mapping
- `jobNumber` = display ID
- `_id` = backend fetch ID
- `customerName`
- `customerPhone`
- `pickupAddress`
- `dropAddress`
- `status`
- `jobType`
- `scheduledDate`
- `scheduledTime`
- `billing.totalAmount`
