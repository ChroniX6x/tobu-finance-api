#!/usr/bin/env tsx
/**
 * Development script: Links existing users to members by matching name/email
 * Run with: npm run link-users
 */

import "dotenv/config";
import mongoose, { Schema, model } from "mongoose";
import argon2 from "argon2";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/tobu_finance";

// User Schema (inline, da direkter Import nicht funktioniert in Scripts)
const UserSchema = new Schema({
  email: { type: String, required: true },
  emailNormalized: { type: String, required: true, unique: true, index: true },
  name: { type: String },
  passwordHash: { type: String, required: true },
  roles: { type: [String], default: ["user"] },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const User = mongoose.models.users || model("users", UserSchema);

// Member Schema (inline)
const MemberSchema = new Schema({
  name: { type: String, default: null },
  email: { type: String, default: null },
  userId: { type: Schema.Types.ObjectId, ref: "users", default: null },
  avatar: { type: String, default: null },
}, { timestamps: true });

const Member = mongoose.models.Member || model("Member", MemberSchema);

interface MemberLinkConfig {
  userEmail: string;
  members: Array<{
    identifyBy: { name?: string; email?: string };
    updateEmail: boolean;
  }>;
}

// Mapping-Konfiguration: Definiere welche Member zu welchen Users gehören
// Jedes Member-Objekt wird einzeln verknüpft und die Email wird auf die User-Email aktualisiert
interface MemberLinkConfig {
  userEmail: string;
  members: Array<{
    identifyBy: { name?: string; email?: string }; // Wie finden wir den Member?
    updateEmail: boolean; // Soll die Email auf User-Email aktualisiert werden?
  }>;
}

interface UserConfig {
  email: string;
  name: string;
  password: string;
  roles: string[];
  members: Array<{
    identifyBy: { name?: string; email?: string };
    updateEmail: boolean;
  }>;
}

const USER_CONFIGS: UserConfig[] = [
  {
    email: "tony@test.de",
    name: "Tony",
    password: "test1234", // Wird nur verwendet wenn User neu erstellt wird
    roles: ["user", "admin"], // Tony bekommt Admin-Rechte
    members: [
      { identifyBy: { name: "Tony" }, updateEmail: true },
      { identifyBy: { name: "Tony Hoffmann" }, updateEmail: true },
    ],
  },
  {
    email: "caro@test.de",
    name: "Carolin",
    password: "test1234",
    roles: ["user"],
    members: [
      { identifyBy: { name: "Caro" }, updateEmail: true },
      { identifyBy: { name: "Carolin Neumann" }, updateEmail: true },
    ],
  },
  {
    email: "test@test.de",
    name: "Test",
    password: "test1234",
    roles: ["user"],
    members: [], // Keine Members verknüpft
  },
];

async function linkUsersToMembers() {
  console.log("🔗 Starting user-to-member linking...\n");

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✓ Connected to MongoDB\n");
    
    // Zeige erstmal alle Member-User Links
    console.log("📋 Current state BEFORE linking:\n");
    const beforeMembers = await Member.find({});
    for (const m of beforeMembers) {
      console.log(`   ${m.name} (${m._id}) → userId: ${m.userId || 'null'}`);
    }
    console.log();

    let linkedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    let createdUsersCount = 0;

    for (const config of USER_CONFIGS) {
      console.log(`\n👤 Processing user: ${config.email}`);

      // 1. Finde oder erstelle den User
      let user = await User.findOne({ emailNormalized: config.email.toLowerCase() });
      
      if (!user) {
        console.log(`  📝 User not found, creating new user...`);
        const passwordHash = await argon2.hash(config.password);
        
        user = new User({
          email: config.email,
          emailNormalized: config.email.toLowerCase(),
          name: config.name,
          passwordHash,
          roles: config.roles,
          isActive: true,
        });
        
        await user.save();
        console.log(`  ✅ Created user: ${user.name} (${user._id}) with roles: ${config.roles.join(", ")}`);
        createdUsersCount++;
      } else {
        console.log(`  ✓ Found existing user: ${user.name} (${user._id})`);
        
        // Update roles if needed (z.B. Tony braucht admin)
        const needsRoleUpdate = config.roles.some(r => !user.roles.includes(r));
        if (needsRoleUpdate) {
          user.roles = [...new Set([...user.roles, ...config.roles])];
          await user.save();
          console.log(`  🔧 Updated roles to: ${user.roles.join(", ")}`);
        }
      }

      // 2. Verknüpfe alle Members für diesen User
      for (const memberConfig of config.members) {
        const { identifyBy, updateEmail } = memberConfig;
        
        // Baue einfache Query um Member zu finden (nur Name)
        const memberQuery: any = {};
        
        if (identifyBy.name) {
          memberQuery.name = identifyBy.name;
        } else if (identifyBy.email) {
          memberQuery.email = identifyBy.email;
        }

        console.log(`  🔍 Searching for member with query:`, JSON.stringify(memberQuery));
        
        const member = await Member.findOne(memberQuery);
        
        if (!member) {
          console.log(`  ⚠ Member not found: ${identifyBy.name || identifyBy.email}`);
          
          // Debug: Zeige alle Members
          const allMembers = await Member.find({}, { name: 1, email: 1, userId: 1 });
          console.log(`  📋 Available members:`, allMembers.map(m => ({ name: m.name, email: m.email, hasUserId: !!m.userId })));
          
          skippedCount++;
          continue;
        }

        // Check ob schon linked zu einem ANDEREN User
        if (member.userId && member.userId.toString() === user._id.toString()) {
          console.log(`  ✓ Member "${member.name}" already linked to correct user`);
          skippedCount++;
          continue;
        }

        // 3. Link User zu Member (überschreibt alten Link falls vorhanden)
        const wasLinked = !!member.userId;
        member.userId = user._id;
        if (updateEmail) {
          member.email = user.email;
        }
        await member.save();
        
        const emailUpdate = updateEmail ? ` (email → ${user.email})` : "";
        const action = wasLinked ? "Re-linked" : "Linked";
        console.log(`  ✅ ${action} "${member.name}"${emailUpdate}`);
        
        if (wasLinked) {
          updatedCount++;
        } else {
          linkedCount++;
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`✨ Linking complete!`);
    console.log(`   Users created: ${createdUsersCount}`);
    console.log(`   New links: ${linkedCount}`);
    console.log(`   Re-linked: ${updatedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log("=".repeat(60) + "\n");

    // Zeige alle Members mit ihren User-Links (ohne populate, direkt die IDs)
    console.log("📋 Member-user links AFTER linking:\n");
    const allMembers = await Member.find({});
    for (const m of allMembers) {
      const userInfo = m.userId ? `→ userId: ${m.userId}` : "→ No user linked";
      console.log(`   ${m.name || "Unnamed"} (${m._id}) ${userInfo}`);
    }
    
    // Verify: Zeige welche User zu welchen Members gehören
    console.log("\n📊 Verification - Users and their members:\n");
    const tony = await User.findOne({ emailNormalized: "tony@test.de" });
    const caro = await User.findOne({ emailNormalized: "caro@test.de" });
    
    if (tony) {
      const tonyMembers = await Member.find({ userId: tony._id });
      console.log(`   Tony (${tony._id}):`);
      tonyMembers.forEach((m: any) => console.log(`     - ${m.name} (${m._id})`));
    }
    
    if (caro) {
      const caroMembers = await Member.find({ userId: caro._id });
      console.log(`   Carolin (${caro._id}):`);
      caroMembers.forEach((m: any) => console.log(`     - ${m.name} (${m._id})`));
    }

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB");
  }
}

// Run the script
linkUsersToMembers();
