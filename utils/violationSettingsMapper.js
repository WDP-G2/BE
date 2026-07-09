var DEFAULT_VIOLATION_TYPES = [
  { code: "FALSE_START", label: "Xuất phát sai", active: true },
  { code: "DANGEROUS_RIDING", label: "Lái nguy hiểm", active: true },
  { code: "EQUIPMENT_VIOLATION", label: "Vi phạm trang bị", active: true },
  { code: "DOPING_SUSPECTED", label: "Nghi doping", active: true },
  { code: "LATE_CHECK_IN", label: "Check-in muộn", active: true },
  { code: "OTHER", label: "Khác", active: true },
];

var DEFAULT_VIOLATION_PENALTY_RULES = [
  { severity: "WARNING", resultAction: "NONE", timePenaltyMillis: 0 },
  { severity: "MINOR", resultAction: "TIME_PENALTY", timePenaltyMillis: 3000 },
  { severity: "MAJOR", resultAction: "TIME_PENALTY", timePenaltyMillis: 10000 },
  { severity: "DISQUALIFICATION", resultAction: "DISQUALIFY", timePenaltyMillis: 0 },
];

var SEVERITY_ORDER = ["WARNING", "MINOR", "MAJOR", "DISQUALIFICATION"];

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d");
}

function generateViolationTypeCode(label, usedCodes) {
  var base = stripDiacritics(label)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!base) base = "VIOLATION_TYPE";
  if (base.length > 72) base = base.slice(0, 72).replace(/_+$/g, "");

  var candidate = base;
  var suffix = 2;
  while (usedCodes[candidate]) {
    candidate = base + "_" + suffix;
    suffix += 1;
  }
  return candidate;
}

function normalizeViolationTypes(rawTypes) {
  var types = Array.isArray(rawTypes) ? rawTypes : [];
  if (!types.length) {
    var err = new Error("Phải có ít nhất một loại vi phạm");
    err.status = 400;
    throw err;
  }

  var labels = {};
  var codes = {};
  var normalized = [];
  var activeCount = 0;

  types.forEach(function (type) {
    var label = String(type && type.label != null ? type.label : "").trim();
    if (!label) {
      var labelErr = new Error("Tên hiển thị loại vi phạm không được để trống");
      labelErr.status = 400;
      throw labelErr;
    }
    if (label.length > 100) {
      var lenErr = new Error("Tên hiển thị loại vi phạm tối đa 100 ký tự");
      lenErr.status = 400;
      throw lenErr;
    }

    var labelKey = label.toLowerCase();
    if (labels[labelKey]) {
      var dupErr = new Error('Loại vi phạm "' + label + '" đang bị trùng');
      dupErr.status = 400;
      throw dupErr;
    }
    labels[labelKey] = true;

    var code = String(type.code || "").trim();
    if (!code) {
      code = generateViolationTypeCode(label, codes);
    } else {
      code = code.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
      if (!code) {
        var codeErr = new Error("Mã loại vi phạm không hợp lệ");
        codeErr.status = 400;
        throw codeErr;
      }
    }
    if (codes[code]) {
      var codeDupErr = new Error("Mã loại vi phạm bị trùng: " + code);
      codeDupErr.status = 400;
      throw codeDupErr;
    }
    codes[code] = true;

    var active = type.active !== false;
    if (active) activeCount += 1;

    normalized.push({ code: code, label: label, active: active });
  });

  if (!activeCount) {
    var activeErr = new Error("Phải có ít nhất một loại vi phạm đang bật");
    activeErr.status = 400;
    throw activeErr;
  }

  return normalized;
}

function normalizeViolationRules(rawRules) {
  var rules = Array.isArray(rawRules) ? rawRules : [];
  if (!rules.length) {
    var err = new Error("Cấu hình xử phạt vi phạm là bắt buộc");
    err.status = 400;
    throw err;
  }

  var bySeverity = {};
  rules.forEach(function (rule) {
    var severity = String(rule && rule.severity != null ? rule.severity : "").trim().toUpperCase();
    var resultAction = String(rule && rule.resultAction != null ? rule.resultAction : "").trim().toUpperCase();
    if (!severity || !resultAction) {
      var reqErr = new Error("Mức độ và tác động kết quả là bắt buộc");
      reqErr.status = 400;
      throw reqErr;
    }
    if (bySeverity[severity]) {
      var dupErr = new Error("Cấu hình xử phạt bị trùng mức độ: " + severity);
      dupErr.status = 400;
      throw dupErr;
    }

    var timePenaltyMillis = Math.max(0, Number(rule.timePenaltyMillis || 0));
    if (resultAction === "TIME_PENALTY" && timePenaltyMillis <= 0) {
      var timeErr = new Error("Mức phạt thời gian cần số giây phạt lớn hơn 0");
      timeErr.status = 400;
      throw timeErr;
    }
    if (resultAction !== "TIME_PENALTY") {
      timePenaltyMillis = 0;
    }

    bySeverity[severity] = {
      severity: severity,
      resultAction: resultAction,
      timePenaltyMillis: timePenaltyMillis,
    };
  });

  return SEVERITY_ORDER.map(function (severity) {
    return (
      bySeverity[severity] ||
      DEFAULT_VIOLATION_PENALTY_RULES.find(function (item) {
        return item.severity === severity;
      }) ||
      { severity: severity, resultAction: "NONE", timePenaltyMillis: 0 }
    );
  });
}

function readViolationTypes(doc) {
  var source = Array.isArray(doc && doc.violationTypes) && doc.violationTypes.length
    ? doc.violationTypes
    : DEFAULT_VIOLATION_TYPES;
  return normalizeViolationTypes(source);
}

function readViolationPenaltyRules(doc) {
  var source = Array.isArray(doc && doc.violationPenaltyRules) && doc.violationPenaltyRules.length
    ? doc.violationPenaltyRules
    : DEFAULT_VIOLATION_PENALTY_RULES;
  return normalizeViolationRules(source);
}

function mapViolationTypesForResponse(types) {
  return (types || []).map(function (item) {
    return {
      code: item.code,
      label: item.label,
      active: item.active !== false,
    };
  });
}

function mapViolationPenaltyRulesForResponse(rules) {
  return (rules || []).map(function (item) {
    return {
      severity: item.severity,
      resultAction: item.resultAction,
      timePenaltyMillis: Number(item.timePenaltyMillis || 0),
    };
  });
}

module.exports = {
  DEFAULT_VIOLATION_TYPES: DEFAULT_VIOLATION_TYPES,
  DEFAULT_VIOLATION_PENALTY_RULES: DEFAULT_VIOLATION_PENALTY_RULES,
  normalizeViolationTypes: normalizeViolationTypes,
  normalizeViolationRules: normalizeViolationRules,
  readViolationTypes: readViolationTypes,
  readViolationPenaltyRules: readViolationPenaltyRules,
  mapViolationTypesForResponse: mapViolationTypesForResponse,
  mapViolationPenaltyRulesForResponse: mapViolationPenaltyRulesForResponse,
};
