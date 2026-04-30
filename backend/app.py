from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import sqlite3
import os
import uuid
import hashlib

app = FastAPI(title="Mini Program Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files directory for serving images
STATIC_DIR = "static"
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

DATABASE = "data/app.db"
UPLOAD_DIR = "uploads"
STATIC_IMAGES_DIR = os.path.join(STATIC_DIR, "images")
COMMISSION_RATE = 0.12

def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    return db

def init_db():
    os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    db = get_db()
    cursor = db.cursor()
    
    cursor.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            open_id TEXT UNIQUE NOT NULL,
            is_admin BOOLEAN DEFAULT 0,
            is_booster BOOLEAN DEFAULT 0,
            is_csr BOOLEAN DEFAULT 0,
            gender TEXT DEFAULT 'unknown',
            nick_name TEXT DEFAULT '',
            avatar_url TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT UNIQUE NOT NULL,
            order_no TEXT,
            open_id TEXT NOT NULL,
            booster_id TEXT DEFAULT '',
            booster_name TEXT DEFAULT '',
            booster_game_id TEXT DEFAULT '',
            game_id TEXT DEFAULT '',
            service_type TEXT DEFAULT '',
            amount REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            quantity INTEGER DEFAULT 1,
            has_addon BOOLEAN DEFAULT 0,
            addon_label TEXT DEFAULT '',
            addon_price REAL DEFAULT 0,
            current_tier TEXT DEFAULT '',
            commission REAL DEFAULT 0,
            commission_rate REAL DEFAULT 0.12,
            booster_actual_income REAL DEFAULT 0,
            confirmed_by TEXT DEFAULT '',
            confirmed_by_role TEXT DEFAULT '',
            finish_time TIMESTAMP,
            complete_time TIMESTAMP,
            refund_time TIMESTAMP,
            refund_by TEXT DEFAULT '',
            refund_type TEXT DEFAULT '',
            settlement_status TEXT DEFAULT 'unsettled',
            settle_time TIMESTAMP,
            user_info TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS chat_rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT UNIQUE NOT NULL,
            target_id TEXT DEFAULT '',
            user_open_id TEXT NOT NULL,
            customer_id TEXT DEFAULT '',
            last_message TEXT DEFAULT '',
            last_update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            users TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            msg_id TEXT UNIQUE NOT NULL,
            room_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            target_id TEXT DEFAULT '',
            text TEXT DEFAULT '',
            msg_type TEXT DEFAULT 'text',
            nick_name TEXT DEFAULT '',
            avatar_url TEXT DEFAULT '',
            refund_info TEXT DEFAULT '{}',
            settlement_info TEXT DEFAULT '{}',
            send_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS settlement_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booster_id TEXT NOT NULL,
            amount REAL DEFAULT 0,
            settle_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            confirm_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'confirmed',
            room_id TEXT DEFAULT '',
            message_ids TEXT DEFAULT '[]',
            confirmed_by TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_id TEXT UNIQUE NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            content_type TEXT DEFAULT 'image/jpeg',
            uploader_id TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    
    db.commit()
    db.close()

# ==================== Data Models ====================

class UserLoginRequest(BaseModel):
    code: str = ""

class OrderCreateRequest(BaseModel):
    game_id: str = ""
    service_type: str = ""
    amount: float = 0
    quantity: int = 1
    current_tier: str = ""
    has_addon: bool = False
    addon_label: str = ""
    addon_price: float = 0
    user_info: dict = {}

class OrderActionRequest(BaseModel):
    order_id: str

class BoosterGrabRequest(BaseModel):
    order_id: str
    booster_name: str = ""
    booster_game_id: str = ""

class AdminReleaseRequest(BaseModel):
    order_id: str

class CSRActionRequest(BaseModel):
    order_id: str = ""
    message_id: str = ""
    room_id: str = ""
    action: str = ""

class CSRSettlementRequest(BaseModel):
    room_id: str
    message_id: str

class UpdateProfileRequest(BaseModel):
    nick_name: str = ""
    avatar_url: str = ""
    gender: str = ""
    is_booster: bool = False

class ImageUploadResponse(BaseModel):
    success: bool
    message: str = ""
    image_id: str = ""
    url: str = ""

# ==================== Middleware ====================

@app.middleware("http")
async def add_auth_user(request: Request, call_next):
    open_id = request.headers.get("X-Open-ID", "")
    request.state.open_id = open_id
    response = await call_next(request)
    return response

# ==================== User Endpoints ====================

@app.post("/api/user/login")
async def user_login(req: Request, body: UserLoginRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()

        if not user:
            db.execute(
                "INSERT INTO users (open_id, is_admin, is_booster, is_csr, gender) VALUES (?, 0, 0, 0, 'unknown')",
                (open_id,)
            )
            db.commit()
            user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()

        return dict(user)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.put("/api/user/profile")
async def update_profile(req: Request, body: UpdateProfileRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        db.execute(
            """UPDATE users SET nick_name = ?, avatar_url = ?, gender = ?, is_booster = ?
               WHERE open_id = ?""",
            (body.nick_name, body.avatar_url, body.gender, body.is_booster, open_id)
        )
        db.commit()
        return {"success": True, "message": "Profile updated"}
    finally:
        db.close()

@app.get("/api/user/me")
async def get_current_user(req: Request):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(user)
    finally:
        db.close()

# ==================== Order Endpoints ====================

@app.post("/api/orders")
async def create_order(req: Request, body: OrderCreateRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    order_id = str(uuid.uuid4())[:8]
    order_no = f"ORD{datetime.now().strftime('%Y%m%d%H%M%S')}{order_id}"

    db = get_db()
    try:
        db.execute(
            """INSERT INTO orders
               (order_id, order_no, open_id, game_id, service_type, amount, quantity,
                current_tier, has_addon, addon_label, addon_price, user_info, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
            (order_id, order_no, open_id, body.game_id, body.service_type,
             body.amount, body.quantity, body.current_tier,
             body.has_addon, body.addon_label, body.addon_price,
             str(body.user_info))
        )
        db.commit()

        order = db.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()
        return dict(order)
    finally:
        db.close()

@app.get("/api/orders")
async def list_orders(req: Request, status: str = None):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if user["is_admin"] or user["is_csr"]:
            if status:
                orders = db.execute("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC", (status,)).fetchall()
            else:
                orders = db.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall()
        elif user["is_booster"]:
            if status:
                orders = db.execute("SELECT * FROM orders WHERE booster_id = ? AND status = ? ORDER BY created_at DESC",
                                  (open_id, status)).fetchall()
            else:
                orders = db.execute("SELECT * FROM orders WHERE booster_id = ? ORDER BY created_at DESC",
                                  (open_id,)).fetchall()
        else:
            if status:
                orders = db.execute("SELECT * FROM orders WHERE open_id = ? AND status = ? ORDER BY created_at DESC",
                                  (open_id, status)).fetchall()
            else:
                orders = db.execute("SELECT * FROM orders WHERE open_id = ? ORDER BY created_at DESC",
                                  (open_id,)).fetchall()

        return [dict(o) for o in orders]
    finally:
        db.close()

@app.get("/api/orders/waiting_grab")
async def get_waiting_orders(req: Request):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()
        if not user or not user["is_booster"]:
            raise HTTPException(status_code=403, detail="Only boosters can view waiting orders")

        orders = db.execute("SELECT * FROM orders WHERE status = 'waiting_grab' ORDER BY created_at ASC").fetchall()
        return [dict(o) for o in orders]
    finally:
        db.close()

@app.post("/api/orders/{order_id}/booster_grab")
async def booster_grab_order(order_id: str, req: Request, body: BoosterGrabRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()
        if not user or not user["is_booster"]:
            raise HTTPException(status_code=403, detail="Only boosters can grab orders")

        order = db.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order["status"] != "waiting_grab":
            raise HTTPException(status_code=400, detail="Order is not available for grabbing")

        db.execute(
            """UPDATE orders SET status = 'processing', booster_id = ?, booster_name = ?,
               booster_game_id = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?""",
            (open_id, body.booster_name, body.booster_game_id, order_id)
        )
        db.commit()

        return {"success": True, "message": "Order grabbed successfully"}
    finally:
        db.close()

@app.post("/api/orders/{order_id}/booster_finish")
async def booster_finish_order(order_id: str, req: Request, body: OrderActionRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        order = db.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order["booster_id"] != open_id:
            raise HTTPException(status_code=403, detail="Only the booster can finish the order")

        if order["status"] != "processing":
            raise HTTPException(status_code=400, detail="Order must be in processing status")

        db.execute(
            """UPDATE orders SET status = 'finished', finish_time = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP WHERE order_id = ?""",
            (order_id,)
        )
        db.commit()

        return {"success": True, "message": "Order finished, waiting for confirmation"}
    finally:
        db.close()

@app.post("/api/orders/{order_id}/user_confirm")
async def user_confirm_order(order_id: str, req: Request, body: OrderActionRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        order = db.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order["open_id"] != open_id:
            raise HTTPException(status_code=403, detail="Only the order owner can confirm")

        if order["status"] != "finished":
            raise HTTPException(status_code=400, detail="Order must be finished status")

        commission = order["amount"] * COMMISSION_RATE
        booster_actual_income = order["amount"] - commission

        db.execute(
            """UPDATE orders SET status = 'completed', complete_time = CURRENT_TIMESTAMP,
               commission = ?, commission_rate = ?, booster_actual_income = ?,
               updated_at = CURRENT_TIMESTAMP WHERE order_id = ?""",
            (commission, COMMISSION_RATE, booster_actual_income, order_id)
        )
        db.commit()

        return {
            "success": True,
            "message": "Order completed",
            "booster_actual_income": booster_actual_income,
            "commission": commission
        }
    finally:
        db.close()

@app.post("/api/orders/{order_id}/admin_confirm")
async def admin_confirm_order(order_id: str, req: Request, body: OrderActionRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()
        if not user or (not user["is_admin"] and not user["is_csr"]):
            raise HTTPException(status_code=403, detail="Only admin or CSR can confirm")

        order = db.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order["status"] != "finished":
            raise HTTPException(status_code=400, detail="Order must be finished status")

        commission = order["amount"] * COMMISSION_RATE
        booster_actual_income = order["amount"] - commission

        db.execute(
            """UPDATE orders SET status = 'completed', complete_time = CURRENT_TIMESTAMP,
               commission = ?, commission_rate = ?, booster_actual_income = ?,
               confirmed_by = ?, confirmed_by_role = 'admin_or_csr',
               updated_at = CURRENT_TIMESTAMP WHERE order_id = ?""",
            (commission, COMMISSION_RATE, booster_actual_income, open_id, order_id)
        )
        db.commit()

        return {
            "success": True,
            "message": "Order completed",
            "booster_actual_income": booster_actual_income,
            "commission": commission
        }
    finally:
        db.close()

@app.post("/api/orders/{order_id}/admin_release")
async def admin_release_booster(order_id: str, req: Request, body: AdminReleaseRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()
        if not user or (not user["is_admin"] and not user["is_csr"]):
            raise HTTPException(status_code=403, detail="Only admin or CSR can release")

        order = db.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order["status"] not in ("processing", "finished"):
            raise HTTPException(status_code=400, detail=f"Order status {order['status']} cannot be released")

        db.execute(
            """UPDATE orders SET status = 'waiting_grab', booster_id = '', booster_name = '',
               booster_game_id = '', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?""",
            (order_id,)
        )
        db.commit()

        return {"success": True, "message": "Booster released successfully", "order_id": order_id}
    finally:
        db.close()

@app.post("/api/orders/{order_id}/csr_approve_refund")
async def csr_approve_refund(order_id: str, req: Request, body: CSRActionRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()
        if not user or not user["is_csr"]:
            raise HTTPException(status_code=403, detail="Only CSR can approve refunds")

        order = db.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if body.action == "reject":
            if body.message_id:
                db.execute(
                    "UPDATE chat_messages SET refund_info = json_set(refund_info, '$.status', 'rejected') WHERE msg_id = ?",
                    (body.message_id,)
                )
                db.commit()

            if body.room_id:
                db.execute(
                    """INSERT INTO chat_messages (msg_id, room_id, sender_id, target_id, text, msg_type, nick_name, avatar_url)
                       VALUES (?, ?, 'SYSTEM', ?, 'Refund request rejected, order will continue.', 'system', 'System', '')""",
                    (str(uuid.uuid4())[:8], body.room_id, order["open_id"])
                )
                db.commit()

            return {"success": True, "message": "Refund rejected"}

        if order["status"] == "refunded":
            raise HTTPException(status_code=400, detail="Order already refunded")

        total_fee = order["amount"] * 100
        if total_fee <= 0:
            db.execute(
                """UPDATE orders SET status = 'refunded', refund_time = CURRENT_TIMESTAMP,
                   refund_by = ?, refund_type = 'csr_approved', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?""",
                (open_id, order_id)
            )
        else:
            out_refund_no = f"csr_ref_{order['order_no']}_{int(datetime.now().timestamp())}"

            db.execute(
                """UPDATE orders SET status = 'refunded', refund_time = CURRENT_TIMESTAMP,
                   refund_by = ?, refund_type = 'csr_approved', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?""",
                (open_id, order_id)
            )

        db.commit()

        if body.message_id:
            db.execute(
                "UPDATE chat_messages SET refund_info = json_set(refund_info, '$.status', 'approved') WHERE msg_id = ?",
                (body.message_id,)
            )
            db.commit()

        if body.room_id:
            db.execute(
                """INSERT INTO chat_messages (msg_id, room_id, sender_id, target_id, text, msg_type, nick_name, avatar_url)
                   VALUES (?, ?, 'SYSTEM', ?, 'Refund approved, money will be returned to your payment account.', 'system', 'System', '')""",
                (str(uuid.uuid4())[:8], body.room_id, order["open_id"])
            )
            db.commit()

        return {"success": True, "message": "Refund approved"}
    finally:
        db.close()

@app.post("/api/orders/{order_id}/csr_approve_settlement")
async def csr_approve_settlement(order_id: str, req: Request, body: CSRSettlementRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()
        if not user or not user["is_csr"]:
            raise HTTPException(status_code=403, detail="Only CSR can approve settlements")

        msg = db.execute("SELECT * FROM chat_messages WHERE msg_id = ?", (body.message_id,)).fetchone()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")

        booster_id = msg["sender_id"]
        latest_amount = msg["settlement_info"]

        if not booster_id:
            raise HTTPException(status_code=400, detail="Cannot get booster ID")

        pending = db.execute(
            """SELECT * FROM chat_messages
               WHERE room_id = ? AND sender_id = ? AND msg_type = 'settlement_request'
               AND json_extract(settlement_info, '$.status') = 'pending'
               ORDER BY send_time DESC""",
            (body.room_id, booster_id)
        ).fetchall()

        if not pending:
            raise HTTPException(status_code=400, detail="No pending settlement requests")

        confirmed_ids = []
        for i, p in enumerate(pending):
            if i == 0:
                db.execute(
                    "UPDATE chat_messages SET settlement_info = json_set(settlement_info, '$.status', 'confirmed') WHERE msg_id = ?",
                    (p["msg_id"],)
                )
                confirmed_ids.append(p["msg_id"])
            else:
                db.execute(
                    "UPDATE chat_messages SET settlement_info = json_set(settlement_info, '$.status', 'cancelled') WHERE msg_id = ?",
                    (p["msg_id"],)
                )

        db.commit()

        import json
        db.execute(
            """INSERT INTO settlement_records (booster_id, amount, room_id, message_ids, confirmed_by)
               VALUES (?, ?, ?, ?, ?)""",
            (booster_id, float(latest_amount) if latest_amount else 0, body.room_id,
             json.dumps(confirmed_ids), open_id)
        )
        db.commit()

        return {
            "success": True,
            "message": "Settlement confirmed",
            "processed_count": len(pending),
            "confirmed_count": len(confirmed_ids),
            "cancelled_count": len(pending) - len(confirmed_ids)
        }
    finally:
        db.close()

@app.post("/api/orders/{order_id}/refund")
async def refund_order(order_id: str, req: Request, body: OrderActionRequest):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        order = db.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        user = db.execute("SELECT * FROM users WHERE open_id = ?", (open_id,)).fetchone()
        if order["open_id"] != open_id and not (user and user["is_admin"]):
            raise HTTPException(status_code=403, detail="No permission to refund")

        if order["status"] not in ("pending", "waiting_grab"):
            raise HTTPException(status_code=400, detail="Order status not allowed for refund")

        total_fee = order["amount"] * 100
        if total_fee <= 0:
            raise HTTPException(status_code=400, detail="No valid payment amount")

        db.execute(
            """UPDATE orders SET status = 'refunded', refund_time = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP WHERE order_id = ?""",
            (order_id,)
        )
        db.commit()

        csr_room_id = f"csr_{open_id}_{int(datetime.now().timestamp())}"
        user_info = order["user_info"] or "{}"

        db.execute(
            """INSERT INTO chat_rooms (room_id, target_id, user_open_id, customer_id, last_message, users)
               VALUES (?, 'SYSTEM_CSR', ?, ?, 'Refund request for order', ?)""",
            (csr_room_id, open_id, open_id, user_info)
        )
        db.commit()

        db.execute(
            """INSERT INTO chat_messages (msg_id, room_id, sender_id, target_id, text, msg_type, refund_info)
               VALUES (?, ?, ?, 'SYSTEM_CSR', ?, 'refund_request', ?)""",
            (str(uuid.uuid4())[:8], csr_room_id, open_id,
             f"Refund request for order {order['order_no']}",
             f'{{"order_id": "{order_id}", "order_no": "{order["order_no"]}", "amount": {order["amount"]}}}')
        )
        db.commit()

        return {
            "success": True,
            "message": "Refund successful",
            "csr_room_id": csr_room_id
        }
    finally:
        db.close()

# ==================== Image Endpoints ====================

@app.post("/api/images/upload", response_model=ImageUploadResponse)
async def upload_image(req: Request, file: UploadFile = File(...)):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    image_id = str(uuid.uuid4())[:8]
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"{image_id}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    db = get_db()
    try:
        db.execute(
            "INSERT INTO images (image_id, filename, filepath, content_type, uploader_id) VALUES (?, ?, ?, ?, ?)",
            (image_id, filename, filepath, file.content_type, open_id)
        )
        db.commit()

        return {
            "success": True,
            "message": "Image uploaded successfully",
            "image_id": image_id,
            "url": f"/api/images/{image_id}"
        }
    finally:
        db.close()

@app.get("/api/images/{image_id}")
async def get_image(image_id: str):
    db = get_db()
    try:
        image = db.execute("SELECT * FROM images WHERE image_id = ?", (image_id,)).fetchone()
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        
        filepath = image["filepath"]
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Image file not found")
        
        return FileResponse(filepath, media_type=image["content_type"])
    finally:
        db.close()

@app.get("/api/images")
async def list_images(req: Request):
    db = get_db()
    try:
        images = db.execute("SELECT image_id, filename, content_type, created_at FROM images ORDER BY created_at DESC").fetchall()
        return [dict(img) for img in images]
    finally:
        db.close()

# ==================== Chat Endpoints ====================

@app.post("/api/chat/rooms")
async def create_chat_room(req: Request, body: dict):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    room_id = body.get("room_id", str(uuid.uuid4())[:8])
    target_id = body.get("target_id", "")

    db = get_db()
    try:
        db.execute(
            """INSERT INTO chat_rooms (room_id, target_id, user_open_id, customer_id, users)
               VALUES (?, ?, ?, ?, ?)""",
            (room_id, target_id, open_id, open_id, '{}')
        )
        db.commit()
        return {"success": True, "room_id": room_id}
    finally:
        db.close()

@app.get("/api/chat/rooms")
async def list_chat_rooms(req: Request):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        rooms = db.execute("SELECT * FROM chat_rooms WHERE user_open_id = ? ORDER BY last_update_time DESC", (open_id,)).fetchall()
        return [dict(r) for r in rooms]
    finally:
        db.close()

@app.get("/api/chat/messages/{room_id}")
async def list_chat_messages(room_id: str, req: Request):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        messages = db.execute("SELECT * FROM chat_messages WHERE room_id = ? ORDER BY send_time ASC", (room_id,)).fetchall()
        return [dict(m) for m in messages]
    finally:
        db.close()

@app.post("/api/chat/messages")
async def send_chat_message(req: Request, body: dict):
    open_id = req.state.open_id
    if not open_id:
        raise HTTPException(status_code=401, detail="X-Open-ID header required")

    db = get_db()
    try:
        msg_id = str(uuid.uuid4())[:8]
        db.execute(
            """INSERT INTO chat_messages (msg_id, room_id, sender_id, target_id, text, msg_type, nick_name, avatar_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (msg_id, body.get("room_id"), open_id, body.get("target_id"),
             body.get("text", ""), body.get("msg_type", "text"),
             body.get("nick_name", ""), body.get("avatar_url", ""))
        )
        db.commit()
        return {"success": True, "msg_id": msg_id}
    finally:
        db.close()

# ==================== Init on startup ====================

@app.on_event("startup")
async def startup_event():
    init_db()
    print("Database initialized successfully")

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
