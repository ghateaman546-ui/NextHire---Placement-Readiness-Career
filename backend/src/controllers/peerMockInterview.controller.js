const { PeerMockInterview } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { isValidMeetingUrl, computeMeetingStatus, JOIN_WINDOW_MINUTES_BEFORE } = require('../config/meetingConfig');

/**
 * POST /api/peer-mock-interviews — schedule a new open slot.
 * body: { domain, company, scheduledFor, durationMinutes, meetingProvider, meetingLink }
 */
exports.scheduleSlot = asyncHandler(async (req, res) => {
  const { domain, company, scheduledFor, durationMinutes, meetingProvider, meetingLink } = req.body;
  if (!domain || !scheduledFor) {
    return res.status(400).json({ success: false, message: 'domain and scheduledFor are required.' });
  }

  // Meeting link is optional at schedule time (a host may add it later), but
  // if one is supplied it must be a real, safe URL for the chosen provider —
  // never silently save something broken/fake.
  const provider = meetingProvider || 'custom';
  if (meetingLink) {
    const check = isValidMeetingUrl(meetingLink, provider);
    if (!check.valid) return res.status(400).json({ success: false, message: check.message });
  }

  const slot = await PeerMockInterview.create({
    host: req.user._id,
    domain,
    company: company || undefined,
    scheduledFor,
    durationMinutes: durationMinutes || 30,
    meetingProvider: provider,
    meetingLink: meetingLink || '',
  });

  res.status(201).json({ success: true, data: slot });
});

/**
 * GET /api/peer-mock-interviews/available — open slots a student can join
 * (excludes the requester's own slots and anything already matched).
 * Meeting details are deliberately excluded here: the host's meeting link
 * is private until someone has actually matched into the session.
 */
exports.listAvailableSlots = asyncHandler(async (req, res) => {
  const slots = await PeerMockInterview.find({
    status: 'open',
    host: { $ne: req.user._id },
    scheduledFor: { $gte: new Date() },
  })
    .select('-meetingLink -meetingProvider')
    .sort({ scheduledFor: 1 })
    .populate('host', 'name college')
    .populate('company', 'name slug');

  res.json({ success: true, data: slots });
});

/** GET /api/peer-mock-interviews/my — own scheduled/past sessions (as host or partner) */
exports.listMySessions = asyncHandler(async (req, res) => {
  const sessions = await PeerMockInterview.find({
    $or: [{ host: req.user._id }, { partner: req.user._id }],
  })
    .sort({ scheduledFor: -1 })
    .populate('host', 'name college')
    .populate('partner', 'name college')
    .populate('company', 'name slug');

  res.json({ success: true, data: sessions });
});

/** POST /api/peer-mock-interviews/:id/join — match with an open slot */
exports.joinSlot = asyncHandler(async (req, res) => {
  const slot = await PeerMockInterview.findById(req.params.id);
  if (!slot) return res.status(404).json({ success: false, message: 'Slot not found.' });
  if (slot.status !== 'open') return res.status(409).json({ success: false, message: 'This slot is no longer available.' });
  if (String(slot.host) === String(req.user._id)) {
    return res.status(400).json({ success: false, message: "You can't join your own slot." });
  }

  slot.partner = req.user._id;
  slot.status = 'matched';
  await slot.save();

  res.json({ success: true, data: slot });
});

/**
 * GET /api/peer-mock-interviews/:id/meeting — the Join Meeting endpoint.
 * Returns the real meeting link + live-computed status ONLY to an
 * authenticated participant (host or matched partner) of this exact
 * session. This is the single place meeting URLs are ever served to a
 * client — listAvailableSlots/listMySessions never include the raw link
 * for non-participants (see listAvailableSlots above).
 */
exports.getMeetingDetails = asyncHandler(async (req, res) => {
  const slot = await PeerMockInterview.findById(req.params.id);
  if (!slot) return res.status(404).json({ success: false, message: 'Session not found.' });

  const uid = String(req.user._id);
  const isParticipant = String(slot.host) === uid || (slot.partner && String(slot.partner) === uid);
  if (!isParticipant) {
    return res.status(403).json({ success: false, message: 'You are not a participant in this session.' });
  }

  if (slot.status === 'cancelled') {
    return res.status(409).json({ success: false, message: 'This meeting has been cancelled.', meetingStatus: 'cancelled' });
  }
  if (slot.status === 'open' || !slot.partner) {
    return res.status(409).json({ success: false, message: 'This session has no partner matched yet.', meetingStatus: 'no-partner' });
  }
  if (!slot.meetingLink) {
    return res.status(409).json({ success: false, message: 'Meeting link not available yet.', meetingStatus: 'no-link' });
  }

  const meetingStatus = computeMeetingStatus(slot);
  res.json({
    success: true,
    data: {
      meetingProvider: slot.meetingProvider,
      meetingLink: slot.meetingLink,
      meetingStatus,
      scheduledFor: slot.scheduledFor,
      durationMinutes: slot.durationMinutes,
      joinWindowMinutesBefore: JOIN_WINDOW_MINUTES_BEFORE,
    },
  });
});

/** POST /api/peer-mock-interviews/:id/complete — mark a matched session as done */
exports.completeSession = asyncHandler(async (req, res) => {
  const slot = await PeerMockInterview.findById(req.params.id);
  if (!slot) return res.status(404).json({ success: false, message: 'Slot not found.' });

  const isParticipant = [String(slot.host), String(slot.partner)].includes(String(req.user._id));
  if (!isParticipant) return res.status(403).json({ success: false, message: 'Not a participant in this session.' });

  slot.status = 'completed';
  slot.completedAt = new Date();
  await slot.save();

  res.json({ success: true, data: slot });
});

/** POST /api/peer-mock-interviews/:id/cancel */
exports.cancelSlot = asyncHandler(async (req, res) => {
  const slot = await PeerMockInterview.findById(req.params.id);
  if (!slot) return res.status(404).json({ success: false, message: 'Slot not found.' });
  if (String(slot.host) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the host can cancel this session.' });
  }
  slot.status = 'cancelled';
  await slot.save();
  res.json({ success: true, data: slot });
});

/**
 * POST /api/peer-mock-interviews/:id/feedback — the peer evaluation form.
 * The submitter rates and comments on the OTHER participant.
 * body: { communicationRating, technicalRating, confidenceRating,
 *         overallRating, strengths, areasToImprove, additionalComments }
 */
exports.submitPeerFeedback = asyncHandler(async (req, res) => {
  const slot = await PeerMockInterview.findById(req.params.id);
  if (!slot) return res.status(404).json({ success: false, message: 'Slot not found.' });
  if (slot.status !== 'completed' && slot.status !== 'matched') {
    return res.status(409).json({ success: false, message: 'Feedback can only be left on a matched or completed session.' });
  }

  const uid = String(req.user._id);
  const isHost = String(slot.host) === uid;
  const isPartner = slot.partner && String(slot.partner) === uid;
  if (!isHost && !isPartner) return res.status(403).json({ success: false, message: 'Not a participant in this session.' });

  const feedback = {
    submittedBy: req.user._id,
    communicationRating: req.body.communicationRating,
    technicalRating: req.body.technicalRating,
    confidenceRating: req.body.confidenceRating,
    overallRating: req.body.overallRating,
    strengths: req.body.strengths || '',
    areasToImprove: req.body.areasToImprove || '',
    additionalComments: req.body.additionalComments || '',
    submittedAt: new Date(),
  };

  // Host leaves feedback ABOUT the partner, and vice versa.
  if (isHost) slot.feedbackForPartner = feedback;
  else slot.feedbackForHost = feedback;

  await slot.save();
  res.json({ success: true, data: slot });
});
