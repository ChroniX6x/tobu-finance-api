import { Schema, model, Types } from "mongoose";

// ------------ User ------------
export interface IUser {
  _id: Types.ObjectId;
  email: string;
  emailNormalized: string;
  name?: string;
  passwordHash: string;
  roles: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true },
    emailNormalized: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    passwordHash: { type: String, required: true },
    roles: { type: [String], default: ["user"], index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

UserSchema.pre("save", function (next) {
  if (this.isModified("email")) {
    // @ts-ignore
    this.emailNormalized = this.email.trim().toLowerCase();
  }
  next();
});

export const User = model<IUser>("users", UserSchema);

// ------------ AuthSession ------------
export interface IAuthSession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  jti: string;       // Token-ID (Refresh)
  userAgent?: string;
  ip?: string;
  rotatedAt?: Date;
  revokedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AuthSessionSchema = new Schema<IAuthSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "users", index: true, required: true },
    jti: { type: String, required: true, unique: true, index: true },
    userAgent: String,
    ip: String,
    rotatedAt: Date,
    revokedAt: { type: Date, index: true },
    expiresAt: { type: Date, required: true }, // index: true entfernt, da TTL-Index unten definiert
  },
  { timestamps: true }
);

// TTL: MongoDB löscht abgelaufene Sessions automatisch
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSession = model<IAuthSession>("auth_sessions", AuthSessionSchema);
