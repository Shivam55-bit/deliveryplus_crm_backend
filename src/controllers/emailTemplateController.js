import EmailTemplate from '../models/EmailTemplate.js';
import ActivityLog from '../models/ActivityLog.js';
import { sendMail } from '../utils/mailer.js';
import {
  getDefaultTemplateConfig,
  AVAILABLE_VARIABLES,
  SAMPLE_DATA_MAP,
} from '../utils/defaultTemplateConfigs.js';
import { renderTemplatePreview } from '../services/templateRenderer.js';
import { sendSuccess, sendError } from '../utils/response.js';

const logTemplateActivity = async ({ userId, action, templateKey, details, metadata = {} }) => {
  try {
    await ActivityLog.create({
      userId,
      action,
      entity: 'EmailTemplate',
      details: details || `Action ${action} on template ${templateKey}`,
      metadata: { templateKey, ...metadata },
    });
  } catch (err) {
    console.error('Failed to create ActivityLog for email template:', err.message);
  }
};

/**
 * Get all available email templates with current status
 */
export const getAllTemplates = async (req, res, next) => {
  try {
    const keys = ['quotation', 'booking_confirmation'];
    const dbTemplates = await EmailTemplate.find({ templateKey: { $in: keys } })
      .populate('updatedBy', 'name email')
      .lean();

    const templateMap = new Map(dbTemplates.map((t) => [t.templateKey, t]));

    const templates = keys.map((key) => {
      const existing = templateMap.get(key);
      if (existing) {
        return {
          ...existing,
          isCustomized: true,
        };
      }

      const defaultConfig = getDefaultTemplateConfig(key);
      return {
        ...defaultConfig,
        _id: `default_${key}`,
        version: 1,
        versions: [],
        isCustomized: false,
        updatedAt: new Date().toISOString(),
      };
    });

    return sendSuccess(res, 200, 'Email templates retrieved successfully', {
      templates,
      availableVariables: AVAILABLE_VARIABLES,
      sampleData: SAMPLE_DATA_MAP,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single template by key
 */
export const getTemplateByKey = async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!['quotation', 'booking_confirmation'].includes(key)) {
      return sendError(res, 400, 'Invalid template key. Must be "quotation" or "booking_confirmation".');
    }

    let template = await EmailTemplate.findOne({ templateKey: key })
      .populate('updatedBy', 'name email')
      .populate('versions.savedBy', 'name email')
      .lean();

    const isCustomized = Boolean(template);

    if (!template) {
      const defaultConfig = getDefaultTemplateConfig(key);
      template = {
        ...defaultConfig,
        _id: `default_${key}`,
        version: 1,
        versions: [],
        isCustomized: false,
        updatedAt: new Date().toISOString(),
      };
    }

    return sendSuccess(res, 200, 'Email template retrieved successfully', {
      template,
      isCustomized,
      defaultTemplate: getDefaultTemplateConfig(key),
      availableVariables: AVAILABLE_VARIABLES,
      sampleData: SAMPLE_DATA_MAP,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update or create email template
 */
export const updateTemplate = async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!['quotation', 'booking_confirmation'].includes(key)) {
      return sendError(res, 400, 'Invalid template key.');
    }

    const {
      subject,
      useCustomHtml,
      customHtml,
      contentConfig,
      designConfig,
      sectionsConfig,
      logoConfig,
      ctaConfig,
      isActive,
      changeNote,
    } = req.body;

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return sendError(res, 400, 'Subject is required.');
    }

    let template = await EmailTemplate.findOne({ templateKey: key });

    const defaultCfg = getDefaultTemplateConfig(key);
    const userId = req.user?._id;
    const userName = req.user?.name || 'Admin';

    if (!template) {
      template = new EmailTemplate({
        templateKey: key,
        name: defaultCfg.name,
        description: defaultCfg.description,
        subject: subject.trim(),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        useCustomHtml: Boolean(useCustomHtml),
        customHtml: typeof customHtml === 'string' ? customHtml : '',
        contentConfig: contentConfig || defaultCfg.contentConfig,
        designConfig: designConfig || defaultCfg.designConfig,
        sectionsConfig: sectionsConfig || defaultCfg.sectionsConfig,
        logoConfig: logoConfig || defaultCfg.logoConfig,
        ctaConfig: ctaConfig || defaultCfg.ctaConfig,
        version: 1,
        versions: [
          {
            version: 1,
            subject: subject.trim(),
            useCustomHtml: Boolean(useCustomHtml),
            customHtml: typeof customHtml === 'string' ? customHtml : '',
            contentConfig: contentConfig || defaultCfg.contentConfig,
            designConfig: designConfig || defaultCfg.designConfig,
            sectionsConfig: sectionsConfig || defaultCfg.sectionsConfig,
            logoConfig: logoConfig || defaultCfg.logoConfig,
            ctaConfig: ctaConfig || defaultCfg.ctaConfig,
            savedAt: new Date(),
            savedBy: userId,
            savedByName: userName,
            changeNote: changeNote || 'Initial customized version',
          },
        ],
        updatedBy: userId,
      });

      await template.save();

      await logTemplateActivity({
        userId,
        action: 'EMAIL_TEMPLATE_CREATED',
        templateKey: key,
        details: `Created customized email template for ${key}`,
        metadata: { version: 1 },
      });
    } else {
      const nextVersion = (template.version || 1) + 1;

      // Add previous or new snapshot
      template.versions.unshift({
        version: nextVersion,
        subject: subject.trim(),
        useCustomHtml: useCustomHtml !== undefined ? Boolean(useCustomHtml) : Boolean(template.useCustomHtml),
        customHtml: customHtml !== undefined ? String(customHtml) : (template.customHtml || ''),
        contentConfig: contentConfig !== undefined ? contentConfig : template.contentConfig,
        designConfig: designConfig !== undefined ? designConfig : template.designConfig,
        sectionsConfig: sectionsConfig !== undefined ? sectionsConfig : template.sectionsConfig,
        logoConfig: logoConfig !== undefined ? logoConfig : template.logoConfig,
        ctaConfig: ctaConfig !== undefined ? ctaConfig : template.ctaConfig,
        savedAt: new Date(),
        savedBy: userId,
        savedByName: userName,
        changeNote: changeNote || `Version ${nextVersion} saved`,
      });

      // Keep maximum 30 version snapshots
      if (template.versions.length > 30) {
        template.versions = template.versions.slice(0, 30);
      }

      template.subject = subject.trim();
      if (useCustomHtml !== undefined) template.useCustomHtml = Boolean(useCustomHtml);
      if (customHtml !== undefined) template.customHtml = String(customHtml);
      if (contentConfig !== undefined) template.contentConfig = contentConfig;
      if (designConfig !== undefined) template.designConfig = designConfig;
      if (sectionsConfig !== undefined) template.sectionsConfig = sectionsConfig;
      if (logoConfig !== undefined) template.logoConfig = logoConfig;
      if (ctaConfig !== undefined) template.ctaConfig = ctaConfig;
      if (isActive !== undefined) template.isActive = Boolean(isActive);
      template.version = nextVersion;
      template.updatedBy = userId;

      await template.save();

      await logTemplateActivity({
        userId,
        action: 'EMAIL_TEMPLATE_UPDATED',
        templateKey: key,
        details: `Updated email template for ${key} to version ${nextVersion}`,
        metadata: { version: nextVersion, isActive: template.isActive },
      });
    }

    return sendSuccess(res, 200, 'Template saved successfully.', {
      template,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Restore template to default design
 */
export const restoreDefault = async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!['quotation', 'booking_confirmation'].includes(key)) {
      return sendError(res, 400, 'Invalid template key.');
    }

    const defaultCfg = getDefaultTemplateConfig(key);
    const userId = req.user?._id;
    const userName = req.user?.name || 'Admin';

    let template = await EmailTemplate.findOne({ templateKey: key });

    if (template) {
      const nextVersion = (template.version || 1) + 1;

      template.versions.unshift({
        version: nextVersion,
        subject: defaultCfg.subject,
        contentConfig: defaultCfg.contentConfig,
        designConfig: defaultCfg.designConfig,
        sectionsConfig: defaultCfg.sectionsConfig,
        logoConfig: defaultCfg.logoConfig,
        ctaConfig: defaultCfg.ctaConfig,
        savedAt: new Date(),
        savedBy: userId,
        savedByName: userName,
        changeNote: 'Restored default system design',
      });

      template.subject = defaultCfg.subject;
      template.contentConfig = defaultCfg.contentConfig;
      template.designConfig = defaultCfg.designConfig;
      template.sectionsConfig = defaultCfg.sectionsConfig;
      template.logoConfig = defaultCfg.logoConfig;
      template.ctaConfig = defaultCfg.ctaConfig;
      template.isActive = true;
      template.version = nextVersion;
      template.updatedBy = userId;

      await template.save();
    }

    await logTemplateActivity({
      userId,
      action: 'EMAIL_TEMPLATE_RESTORED',
      templateKey: key,
      details: `Restored default design for email template ${key}`,
    });

    return sendSuccess(res, 200, 'Default template restored successfully.', {
      template: template || { ...defaultCfg, version: 1, versions: [] },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Restore a historical version
 */
export const restoreVersion = async (req, res, next) => {
  try {
    const { key, version } = req.params;
    const targetVersion = Number(version);

    if (!targetVersion || Number.isNaN(targetVersion)) {
      return sendError(res, 400, 'Invalid version number.');
    }

    const template = await EmailTemplate.findOne({ templateKey: key });
    if (!template) {
      return sendError(res, 404, 'Template not found in database.');
    }

    const snapshot = template.versions.find((v) => v.version === targetVersion);
    if (!snapshot) {
      return sendError(res, 404, `Version ${targetVersion} not found in template history.`);
    }

    const userId = req.user?._id;
    const userName = req.user?.name || 'Admin';
    const nextVersion = (template.version || 1) + 1;

    template.subject = snapshot.subject;
    template.contentConfig = snapshot.contentConfig;
    template.designConfig = snapshot.designConfig;
    template.sectionsConfig = snapshot.sectionsConfig;
    template.logoConfig = snapshot.logoConfig;
    template.ctaConfig = snapshot.ctaConfig;
    template.version = nextVersion;
    template.updatedBy = userId;

    template.versions.unshift({
      version: nextVersion,
      subject: snapshot.subject,
      contentConfig: snapshot.contentConfig,
      designConfig: snapshot.designConfig,
      sectionsConfig: snapshot.sectionsConfig,
      logoConfig: snapshot.logoConfig,
      ctaConfig: snapshot.ctaConfig,
      savedAt: new Date(),
      savedBy: userId,
      savedByName: userName,
      changeNote: `Restored from version ${targetVersion}`,
    });

    await template.save();

    await logTemplateActivity({
      userId,
      action: 'EMAIL_TEMPLATE_VERSION_RESTORED',
      templateKey: key,
      details: `Restored version ${targetVersion} for email template ${key}`,
      metadata: { targetVersion, newVersion: nextVersion },
    });

    return sendSuccess(res, 200, `Successfully restored version ${targetVersion}.`, {
      template,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate real-time live preview of template
 */
export const previewTemplate = async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!['quotation', 'booking_confirmation'].includes(key)) {
      return sendError(res, 400, 'Invalid template key.');
    }

    const defaultCfg = getDefaultTemplateConfig(key);
    const body = req.body || {};

    const templateConfig = {
      subject: body.subject || defaultCfg.subject,
      contentConfig: body.contentConfig || defaultCfg.contentConfig,
      designConfig: body.designConfig || defaultCfg.designConfig,
      sectionsConfig: body.sectionsConfig || defaultCfg.sectionsConfig,
      logoConfig: body.logoConfig || defaultCfg.logoConfig,
      ctaConfig: body.ctaConfig || defaultCfg.ctaConfig,
    };

    const preview = renderTemplatePreview(key, templateConfig, body.sampleDataOverride || {});

    return sendSuccess(res, 200, 'Template preview rendered successfully.', preview);
  } catch (error) {
    next(error);
  }
};

/**
 * Send test email to specified recipient
 */
export const sendTestEmail = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { toEmail, templateConfig, sampleDataOverride } = req.body;

    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return sendError(res, 400, 'A valid recipient email address is required.');
    }

    const defaultCfg = getDefaultTemplateConfig(key);
    const cfg = templateConfig || (await EmailTemplate.findOne({ templateKey: key }).lean()) || defaultCfg;

    const rendered = renderTemplatePreview(key, cfg, sampleDataOverride || {});

    const info = await sendMail({
      to: toEmail,
      subject: `[TEST] ${rendered.subject}`,
      text: rendered.text,
      html: rendered.html,
      attachments: rendered.attachments,
    });

    await logTemplateActivity({
      userId: req.user?._id,
      action: 'EMAIL_TEMPLATE_TEST_SENT',
      templateKey: key,
      details: `Sent test email for ${key} to ${toEmail}`,
      metadata: { toEmail, messageId: info.messageId },
    });

    return sendSuccess(res, 200, `Test email successfully sent to ${toEmail}.`, {
      messageId: info.messageId,
      recipient: toEmail,
    });
  } catch (error) {
    console.error('Send test email failed:', error);
    return sendError(res, 500, error.message || 'Failed to send test email.');
  }
};
