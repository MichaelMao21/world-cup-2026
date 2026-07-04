(function createPredictionService(global) {
  const STORAGE_KEY = "world-cup-prediction-demo-v1";
  const USER_KEY = "world-cup-prediction-user-v1";

  function makeId() {
    return global.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readDemoData() {
    try {
      return JSON.parse(global.localStorage.getItem(STORAGE_KEY)) || { profiles: [], rooms: [], members: [], predictions: [], events: [] };
    } catch {
      return { profiles: [], rooms: [], members: [], predictions: [], events: [] };
    }
  }

  function writeDemoData(data) {
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getLocalUserId() {
    let id = global.localStorage.getItem(USER_KEY);
    if (!id) {
      id = makeId();
      global.localStorage.setItem(USER_KEY, id);
    }
    return id;
  }

  function avatarText(nickname) {
    return Array.from(nickname.trim()).slice(-1)[0] || "球";
  }

  function addedDocumentId(result) {
    return result?.id || result?._id || result?.ids?.[0] || result?.data?.id || result?.data?._id || "";
  }

  function missingCloudBackendError() {
    return new Error("CloudBase 服务未连接，请刷新页面后重试");
  }

  class DemoPredictionService {
    constructor() {
      this.mode = "demo";
      this.userId = getLocalUserId();
    }

    async getProfile() {
      return readDemoData().profiles.find((profile) => profile.id === this.userId) || null;
    }

    async ensureProfile(nickname) {
      const data = readDemoData();
      let profile = data.profiles.find((item) => item.id === this.userId);
      if (!profile && !nickname) return null;
      if (!profile) {
        profile = { id: this.userId, nickname: nickname.trim(), avatar_text: avatarText(nickname) };
        data.profiles.push(profile);
      } else if (nickname && profile.nickname !== nickname.trim()) {
        profile.nickname = nickname.trim();
        profile.avatar_text = avatarText(nickname);
      }
      writeDemoData(data);
      return profile;
    }

    async createRoom(payload) {
      const data = readDemoData();
      const now = new Date().toISOString();
      const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
      const room = {
        id: roomId,
        code: roomId,
        creator_id: this.userId,
        match_id: payload.matchId,
        match_label: payload.matchLabel,
        status: "open",
        max_players: 20,
        created_at: now,
      };
      data.rooms.push(room);
      data.members.push({ room_id: room.id, user_id: this.userId, joined_at: room.created_at });
      data.predictions.push({
        room_id: room.id,
        user_id: this.userId,
        match_id: payload.matchId,
        match_label: payload.matchLabel,
        answers: payload.answers,
        points: 0,
        hits: 0,
        submitted_at: room.created_at,
      });
      this.syncDemoMatchPredictions(data, payload.matchId, payload.matchLabel, payload.answers, now);
      writeDemoData(data);
      return this.getRoom(room.id);
    }

    async joinRoom(roomId) {
      const room = await this.getRoom(roomId);
      const resolvedRoomId = room.room.id;
      const data = readDemoData();
      if (!data.members.some((member) => member.room_id === resolvedRoomId && member.user_id === this.userId)) {
        data.members.push({ room_id: resolvedRoomId, user_id: this.userId, joined_at: new Date().toISOString() });
        writeDemoData(data);
      }
      return this.getRoom(resolvedRoomId);
    }

    async savePrediction(roomId, answers) {
      const data = readDemoData();
      const room = data.rooms.find((item) => item.id === roomId || item.code === roomId);
      if (!room) throw new Error("预测房不存在或已失效");
      const now = new Date().toISOString();
      const existing = data.predictions.find((item) => item.room_id === room.id && item.user_id === this.userId);
      if (existing) {
        existing.answers = answers;
        existing.match_id = room.match_id;
        existing.match_label = room.match_label;
        existing.submitted_at = now;
      } else {
        data.predictions.push({ room_id: room.id, user_id: this.userId, match_id: room.match_id, match_label: room.match_label, answers, points: 0, hits: 0, submitted_at: now });
      }
      this.syncDemoMatchPredictions(data, room.match_id, room.match_label, answers, now);
      writeDemoData(data);
      return this.getRoom(room.id);
    }

    async savePersonalPrediction(payload) {
      const data = readDemoData();
      const roomId = `personal:${payload.matchId}:${this.userId}`;
      const existing = data.predictions.find((item) => item.room_id === roomId && item.user_id === this.userId);
      const record = {
        room_id: roomId,
        user_id: this.userId,
        match_id: payload.matchId,
        match_label: payload.matchLabel,
        answers: payload.answers,
        points: 0,
        hits: 0,
        is_personal: true,
        submitted_at: new Date().toISOString(),
      };
      if (existing) Object.assign(existing, record);
      else data.predictions.push(record);
      this.syncDemoMatchPredictions(data, payload.matchId, payload.matchLabel, payload.answers, record.submitted_at);
      writeDemoData(data);
      return record;
    }

    syncDemoMatchPredictions(data, matchId, matchLabel, answers, submittedAt) {
      data.predictions.forEach((prediction) => {
        const room = data.rooms.find((item) => item.id === prediction.room_id);
        const predictionMatchId = prediction.match_id || room?.match_id;
        if (prediction.user_id === this.userId && String(predictionMatchId || "") === String(matchId || "")) {
          prediction.match_id = matchId;
          prediction.match_label = matchLabel || prediction.match_label || room?.match_label || "";
          prediction.answers = answers;
          prediction.submitted_at = submittedAt;
        }
      });
    }

    async getRoom(roomId) {
      const data = readDemoData();
      const room = data.rooms.find((item) => item.id === roomId || item.code === roomId);
      if (!room) throw new Error("预测房不存在或已失效");
      const members = data.members
        .filter((item) => item.room_id === room.id)
        .map((member) => data.profiles.find((profile) => profile.id === member.user_id))
        .filter(Boolean);
      const prediction = data.predictions.find((item) => item.room_id === room.id && item.user_id === this.userId) || null;
      const predictions = data.predictions
        .filter((item) => item.room_id === room.id)
        .map((item) => ({
          ...item,
          nickname: data.profiles.find((profile) => profile.id === item.user_id)?.nickname || "匿名球迷",
          is_creator: item.user_id === room.creator_id,
          is_me: item.user_id === this.userId,
        }));
      return { room, members, prediction, predictions };
    }

    async getLeaderboard() {
      const data = readDemoData();
      return data.profiles.map((profile) => {
        const predictions = data.predictions.filter((item) => item.user_id === profile.id);
        return {
          user_id: profile.id,
          nickname: profile.nickname,
          avatar_text: profile.avatar_text,
          total_points: predictions.reduce((sum, item) => sum + (item.points || 0), 0),
          predictions_count: predictions.length,
          wins: 0,
        };
      }).sort((a, b) => b.total_points - a.total_points).slice(0, 20);
    }

    async getMyPredictions() {
      const data = readDemoData();
      return data.predictions
        .filter((item) => item.user_id === this.userId)
        .map((prediction) => ({
          prediction,
          room: data.rooms.find((room) => room.id === prediction.room_id) || null,
        }))
        .filter((item) => item.room || item.prediction.is_personal)
        .sort((a, b) => String(b.prediction.submitted_at || "").localeCompare(String(a.prediction.submitted_at || "")));
    }

    async logEvent(type, payload = {}) {
      const data = readDemoData();
      data.events = data.events || [];
      data.events.push({
        id: makeId(),
        type,
        payload,
        user_id: this.userId,
        url: global.location?.href || "",
        created_at: new Date().toISOString(),
      });
      writeDemoData(data);
    }
  }

  class CloudBasePredictionService {
    constructor(app) {
      this.mode = "cloudbase";
      this.app = app;
      this.auth = app.auth({ persistence: "local" });
      this.db = app.database();
      this.userId = null;
    }

    async authenticate() {
      if (this.userId) return this.userId;
      let loginState = await this.auth.getLoginState?.();
      if (!loginState) {
        if (this.auth.anonymousAuthProvider) {
          await this.auth.anonymousAuthProvider().signIn();
        } else if (this.auth.signInAnonymously) {
          await this.auth.signInAnonymously();
        } else {
          throw new Error("CloudBase 匿名登录不可用，请在控制台开启匿名登录");
        }
        loginState = await this.auth.getLoginState?.();
      }
      this.userId = loginState?.user?.uid || loginState?.user?.openid || loginState?.user?.uuid;
      if (!this.userId) throw new Error("CloudBase 登录失败，请检查登录方式配置");
      return this.userId;
    }

    async getProfile() {
      await this.authenticate();
      try {
        const result = await this.db.collection("profiles").where({ user_id: this.userId }).limit(1).get();
        return result.data?.[0] || null;
      } catch {
        try {
          const result = await this.db.collection("profiles").doc(this.userId).get();
          return result.data?.[0] || result.data || null;
        } catch {
          return null;
        }
      }
    }

    async ensureProfile(nickname) {
      await this.authenticate();
      const current = await this.getProfile();
      if (!current && !nickname) return null;
      if (current && !nickname) return current;
      const now = new Date().toISOString();
      const profile = {
        user_id: this.userId,
        nickname: nickname.trim(),
        avatar_text: avatarText(nickname),
        updated_at: now,
      };
      if (!current) profile.created_at = now;
      if (current?._id) {
        await this.db.collection("profiles").doc(current._id).set(profile);
        return { ...current, ...profile };
      }
      const result = await this.db.collection("profiles").add(profile);
      return { _id: addedDocumentId(result), ...profile };
    }

    async createRoom(payload) {
      await this.authenticate();
      const now = new Date().toISOString();

      // Reuse existing room if the user already has one for this match.
      try {
        const existingResult = await this.db
          .collection("prediction_rooms")
          .where({ creator_id: this.userId, match_id: payload.matchId })
          .limit(1)
          .get();
        const existingRoom = (existingResult.data || [])[0];
        if (existingRoom) {
          const existingRoomId = existingRoom._id || existingRoom.id;
          // Update the prediction in that room with the latest answers.
          const predResult = await this.db
            .collection("predictions")
            .where({ room_id: existingRoomId, user_id: this.userId })
            .limit(1)
            .get();
          const predRecord = {
            room_id: existingRoomId,
            user_id: this.userId,
            match_id: payload.matchId,
            match_label: payload.matchLabel,
            answers: payload.answers,
            points: 0,
            hits: 0,
            is_winner: false,
            submitted_at: now,
          };
          const existingPred = (predResult.data || [])[0];
          if (existingPred?._id) {
            await this.db.collection("predictions").doc(existingPred._id).set(predRecord);
          } else {
            await this.db.collection("predictions").add(predRecord);
          }
          return this.getRoom(existingRoomId);
        }
      } catch {
        // Fall through to create a new room.
      }

      const roomPayload = {
        creator_id: this.userId,
        match_id: payload.matchId,
        match_label: payload.matchLabel,
        status: "open",
        max_players: 20,
        created_at: now,
      };
      const roomResult = await this.db.collection("prediction_rooms").add(roomPayload);
      const roomId = addedDocumentId(roomResult);
      if (!roomId) throw new Error("PK房创建失败，请重试");
      await this.db.collection("room_members").add({ room_id: roomId, user_id: this.userId, joined_at: now });
      await this.db.collection("predictions").add({
        room_id: roomId,
        user_id: this.userId,
        match_id: payload.matchId,
        match_label: payload.matchLabel,
        answers: payload.answers,
        points: 0,
        hits: 0,
        is_winner: false,
        submitted_at: now,
      });
      await this.safeSyncUserMatchPredictions(payload.matchId, payload.matchLabel, payload.answers, now);
      return this.getRoom(roomId);
    }

    async joinRoom(roomId) {
      await this.authenticate();
      const resolvedRoomId = await this.resolveRoomId(roomId);
      const existing = await this.db.collection("room_members").where({ room_id: resolvedRoomId, user_id: this.userId }).limit(1).get();
      if (!(existing.data || []).length) {
        await this.db.collection("room_members").add({
          room_id: resolvedRoomId,
          user_id: this.userId,
          joined_at: new Date().toISOString(),
        });
      }
      return this.getRoom(resolvedRoomId);
    }

    async savePrediction(roomId, answers) {
      await this.authenticate();
      const resolvedRoomId = await this.resolveRoomId(roomId);
      const roomResult = await this.db.collection("prediction_rooms").doc(resolvedRoomId).get();
      const room = roomResult.data?.[0] || roomResult.data;
      if (!room) throw new Error("预测房不存在或已失效");
      const now = new Date().toISOString();
      const payload = {
        room_id: resolvedRoomId,
        user_id: this.userId,
        match_id: room.match_id,
        match_label: room.match_label,
        answers,
        points: 0,
        hits: 0,
        is_winner: false,
        submitted_at: now,
      };
      const existing = await this.db.collection("predictions").where({ room_id: resolvedRoomId, user_id: this.userId }).limit(1).get();
      const current = (existing.data || [])[0];
      if (current?._id) {
        await this.db.collection("predictions").doc(current._id).set(payload);
      } else {
        await this.db.collection("predictions").add(payload);
      }
      await this.safeSyncUserMatchPredictions(room.match_id, room.match_label, answers, now);
      return this.getRoom(resolvedRoomId);
    }

    async savePersonalPrediction(payload) {
      await this.authenticate();
      const now = new Date().toISOString();
      const roomId = `personal:${payload.matchId}:${this.userId}`;
      const record = {
        room_id: roomId,
        user_id: this.userId,
        match_id: payload.matchId,
        match_label: payload.matchLabel,
        answers: payload.answers,
        points: 0,
        hits: 0,
        is_winner: false,
        is_personal: true,
        submitted_at: now,
      };
      const existing = await this.db.collection("predictions").where({ room_id: roomId, user_id: this.userId }).limit(1).get();
      const current = (existing.data || [])[0];
      if (current?._id) {
        await this.db.collection("predictions").doc(current._id).set(record);
        await this.safeSyncUserMatchPredictions(payload.matchId, payload.matchLabel, payload.answers, now);
        return { ...current, ...record };
      }
      const result = await this.db.collection("predictions").add(record);
      await this.safeSyncUserMatchPredictions(payload.matchId, payload.matchLabel, payload.answers, now);
      return { _id: addedDocumentId(result), ...record };
    }

    async safeSyncUserMatchPredictions(matchId, matchLabel, answers, submittedAt) {
      try {
        await this.syncUserMatchPredictions(matchId, matchLabel, answers, submittedAt);
      } catch (error) {
        console.warn("Sync user match predictions failed:", error);
      }
    }

    async syncUserMatchPredictions(matchId, matchLabel, answers, submittedAt) {
      if (!matchId) return;
      const result = await this.db.collection("predictions").where({ user_id: this.userId }).limit(200).get();
      const predictions = result.data || [];
      for (const prediction of predictions) {
        let predictionMatchId = prediction.match_id;
        let predictionMatchLabel = prediction.match_label;
        if (!predictionMatchId && prediction.room_id && !prediction.is_personal) {
          try {
            const roomResult = await this.db.collection("prediction_rooms").doc(prediction.room_id).get();
            const room = roomResult.data?.[0] || roomResult.data;
            predictionMatchId = room?.match_id;
            predictionMatchLabel = room?.match_label;
          } catch {
            // Ignore legacy records that cannot be resolved.
          }
        }
        if (String(predictionMatchId || "") !== String(matchId || "")) continue;
        const id = prediction._id || prediction.id;
        if (!id) continue;
        const { _id, id: ignoredId, ...record } = prediction;
        await this.db.collection("predictions").doc(id).set({
          ...record,
          match_id: matchId,
          match_label: matchLabel || predictionMatchLabel || prediction.match_label || "",
          answers,
          submitted_at: submittedAt,
        });
      }
    }

    async getProfileByUserId(userId) {
      try {
        const result = await this.db.collection("profiles").where({ user_id: userId }).limit(1).get();
        const profile = result.data?.[0];
        if (profile) return profile;
      } catch {
        // Fall back to legacy profiles stored with user id as document id.
      }
      try {
        const result = await this.db.collection("profiles").doc(userId).get();
        return result.data?.[0] || result.data || null;
      } catch {
        return null;
      }
    }

    async resolveRoomId(roomRef) {
      const ref = String(roomRef || "").trim();
      if (!ref) throw new Error("预测房不存在或已失效");
      try {
        const directResult = await this.db.collection("prediction_rooms").doc(ref).get();
        const directRoom = directResult.data?.[0] || directResult.data;
        if (directRoom) return directRoom._id || directRoom.id || ref;
      } catch {
        // Try short room code below.
      }
      const codeResult = await this.db.collection("prediction_rooms").where({ code: ref }).limit(1).get();
      const room = codeResult.data?.[0];
      const id = room?._id || room?.id;
      if (!id) throw new Error("预测房不存在或已失效");
      return id;
    }

    async getRoom(roomId) {
      await this.authenticate();
      const resolvedRoomId = await this.resolveRoomId(roomId);
      const roomResult = await this.db.collection("prediction_rooms").doc(resolvedRoomId).get();
      const room = roomResult.data?.[0] || roomResult.data;
      if (!room) throw new Error("预测房不存在或已失效");

      const membersResult = await this.db.collection("room_members").where({ room_id: resolvedRoomId }).get();
      const memberRows = membersResult.data || [];
      const members = [];
      for (const member of memberRows) {
        const profile = await this.getProfileByUserId(member.user_id);
        if (profile) members.push({ id: member.user_id, user_id: member.user_id, ...profile });
      }

      let prediction = null;
      try {
        const predictionResult = await this.db.collection("predictions").where({ room_id: resolvedRoomId, user_id: this.userId }).limit(1).get();
        prediction = predictionResult.data?.[0] || null;
      } catch {
        prediction = null;
      }
      let predictions = [];
      try {
        const predictionsResult = await this.db.collection("predictions").where({ room_id: resolvedRoomId }).get();
        predictions = (predictionsResult.data || []).map((item) => {
          const profile = members.find((member) => (member.user_id || member.id) === item.user_id);
          return {
            ...item,
            nickname: profile?.nickname || "匿名球迷",
            is_creator: item.user_id === room.creator_id,
            is_me: item.user_id === this.userId,
          };
        });
      } catch {
        predictions = prediction ? [{ ...prediction, nickname: "我", is_me: true }] : [];
      }
      return { room: { ...room, id: room._id || room.id || resolvedRoomId }, members, prediction, predictions };
    }

    async getLeaderboard() {
      const profilesResult = await this.db.collection("profiles").limit(200).get();
      const predictionsResult = await this.db.collection("predictions").limit(1000).get();
      const predictions = predictionsResult.data || [];
      return (profilesResult.data || []).map((profile) => {
        const userPredictions = predictions.filter((item) => item.user_id === (profile._id || profile.id));
        return {
          user_id: profile._id || profile.id,
          nickname: profile.nickname,
          avatar_text: profile.avatar_text,
          total_points: userPredictions.reduce((sum, item) => sum + (item.points || 0), 0),
          predictions_count: userPredictions.length,
          wins: userPredictions.filter((item) => item.is_winner).length,
        };
      }).sort((a, b) => b.total_points - a.total_points).slice(0, 20);
    }

    async getMyPredictions() {
      await this.authenticate();
      const result = await this.db.collection("predictions").where({ user_id: this.userId }).limit(200).get();
      const predictions = result.data || [];
      const items = [];
      for (const prediction of predictions) {
        const roomId = prediction.room_id;
        if (!roomId) continue;
        if (prediction.is_personal) {
          items.push({ prediction, room: null });
          continue;
        }
        try {
          const roomResult = await this.db.collection("prediction_rooms").doc(roomId).get();
          const room = roomResult.data?.[0] || roomResult.data;
          if (room) items.push({ prediction, room: { ...room, id: room._id || room.id || roomId } });
        } catch {
          // Keep history usable even if one legacy room cannot be read.
        }
      }
      return items.sort((a, b) => String(b.prediction.submitted_at || "").localeCompare(String(a.prediction.submitted_at || "")));
    }

    async logEvent(type, payload = {}) {
      await this.authenticate();
      await this.db.collection("events").add({
        type,
        payload,
        user_id: this.userId,
        url: global.location?.href || "",
        user_agent: global.navigator?.userAgent || "",
        created_at: new Date().toISOString(),
      });
    }
  }

  class SupabasePredictionService {
    constructor(client) {
      this.mode = "cloud";
      this.client = client;
      this.userId = null;
    }

    async authenticate() {
      const { data: sessionData } = await this.client.auth.getSession();
      let user = sessionData.session?.user;
      if (!user) {
        const { data, error } = await this.client.auth.signInAnonymously();
        if (error) throw error;
        user = data.user;
      }
      this.userId = user.id;
      return user;
    }

    async getProfile() {
      await this.authenticate();
      const { data, error } = await this.client.from("profiles").select("id,nickname,avatar_text").eq("id", this.userId).maybeSingle();
      if (error) throw error;
      return data;
    }

    async ensureProfile(nickname) {
      await this.authenticate();
      const current = await this.getProfile();
      if (!current && !nickname) return null;
      if (current && !nickname) return current;
      const profile = { id: this.userId, nickname: nickname.trim(), avatar_text: avatarText(nickname) };
      const { data, error } = await this.client.from("profiles").upsert(profile).select("id,nickname,avatar_text").single();
      if (error) throw error;
      return data;
    }

    async createRoom(payload) {
      await this.authenticate();
      const { data: room, error: roomError } = await this.client.from("prediction_rooms").insert({
        creator_id: this.userId,
        match_id: payload.matchId,
        match_label: payload.matchLabel,
      }).select("*").single();
      if (roomError) throw roomError;
      const { error: memberError } = await this.client.from("room_members").insert({ room_id: room.id, user_id: this.userId });
      if (memberError) throw memberError;
      const { error: predictionError } = await this.client.from("predictions").insert({ room_id: room.id, user_id: this.userId, answers: payload.answers });
      if (predictionError) throw predictionError;
      return this.getRoom(room.id);
    }

    async joinRoom(roomId) {
      await this.authenticate();
      const { error } = await this.client.from("room_members").upsert({ room_id: roomId, user_id: this.userId }, { onConflict: "room_id,user_id" });
      if (error) throw error;
      return this.getRoom(roomId);
    }

    async savePrediction(roomId, answers) {
      await this.authenticate();
      const { error } = await this.client.from("predictions").upsert(
        { room_id: roomId, user_id: this.userId, answers, submitted_at: new Date().toISOString() },
        { onConflict: "room_id,user_id" },
      );
      if (error) throw error;
      return this.getRoom(roomId);
    }

    async getRoom(roomId) {
      await this.authenticate();
      const { data: room, error: roomError } = await this.client.from("prediction_rooms").select("*").eq("id", roomId).single();
      if (roomError) throw roomError;
      const { data: memberRows, error: memberError } = await this.client.from("room_members").select("user_id,joined_at").eq("room_id", roomId).order("joined_at");
      if (memberError) throw memberError;
      const ids = memberRows.map((item) => item.user_id);
      let members = [];
      if (ids.length) {
        const { data, error } = await this.client.from("profiles").select("id,nickname,avatar_text").in("id", ids);
        if (error) throw error;
        members = data;
      }
      const { data: prediction, error: predictionError } = await this.client.from("predictions").select("answers,points,hits,submitted_at").eq("room_id", roomId).eq("user_id", this.userId).maybeSingle();
      if (predictionError) throw predictionError;
      const { data: predictions, error: predictionsError } = await this.client.from("predictions").select("room_id,user_id,answers,points,hits,submitted_at").eq("room_id", roomId);
      if (predictionsError) throw predictionsError;
      return {
        room,
        members,
        prediction,
        predictions: (predictions || []).map((item) => ({
          ...item,
          nickname: members.find((member) => member.id === item.user_id)?.nickname || "匿名球迷",
          is_creator: item.user_id === room.creator_id,
          is_me: item.user_id === this.userId,
        })),
      };
    }

    async getLeaderboard() {
      const { data, error } = await this.client.rpc("get_prediction_leaderboard", { limit_count: 20 });
      if (error) throw error;
      return data;
    }

    async getMyPredictions() {
      await this.authenticate();
      const { data: predictions, error } = await this.client.from("predictions").select("*").eq("user_id", this.userId).order("submitted_at", { ascending: false }).limit(200);
      if (error) throw error;
      const items = [];
      for (const prediction of predictions || []) {
        const { data: room } = await this.client.from("prediction_rooms").select("*").eq("id", prediction.room_id).maybeSingle();
        if (room) items.push({ prediction, room });
      }
      return items;
    }

    async logEvent(type, payload = {}) {
      await this.authenticate();
      await this.client.from("events").insert({
        type,
        payload,
        user_id: this.userId,
        url: global.location?.href || "",
        user_agent: global.navigator?.userAgent || "",
        created_at: new Date().toISOString(),
      });
    }
  }

  global.PredictionService = {
    create(config = {}) {
      const canUseCloudBase = config.cloudbaseEnvId && global.cloudbase?.init;
      if (canUseCloudBase) return new CloudBasePredictionService(global.cloudbase.init({ env: config.cloudbaseEnvId }));
      if (config.cloudbaseEnvId) throw missingCloudBackendError();
      const canUseCloud = config.supabaseUrl && config.supabaseAnonKey && global.supabase?.createClient;
      if (!canUseCloud) return new DemoPredictionService();
      return new SupabasePredictionService(global.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey));
    },
  };
})(window);
