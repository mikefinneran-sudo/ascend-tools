'use strict';

const HUBSPOT_API = 'https://api.hubapi.com';
const PIPELINE_ID = '872748866';
const DEAL_STAGE_MQL = '1307255413';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
}

async function hubspotRequest(method, path, body) {
  const token = process.env.HUBSPOT_PAT;
  if (!token) throw new Error('HUBSPOT_PAT not configured');

  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(HUBSPOT_API + path, opts);
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error('HubSpot API error: ' + resp.status);
    err.status = resp.status;
    err.detail = data;
    throw err;
  }
  return data;
}

async function searchCompany(name) {
  return hubspotRequest('POST', '/crm/v3/objects/companies/search', {
    filterGroups: [{
      filters: [{
        propertyName: 'name',
        operator: 'EQ',
        value: name
      }]
    }],
    properties: ['name', 'domain', 'partner_type', 'partner_owner', 'partner_pricing', 'partner_trial', 'partner_benefits', 'partner_page_url'],
    limit: 5
  });
}

async function createCompany(data) {
  return hubspotRequest('POST', '/crm/v3/objects/companies', {
    properties: {
      name: data.name,
      domain: data.website || '',
      description: 'Partner community — ' + data.name,
      partner_type: 'partner_community',
      partner_owner: data.owner || '',
      partner_pricing: data.pricing || 'Standard pricing',
      partner_trial: data.trial || 'Basic free trial',
      partner_benefits: data.benefits || '',
      partner_page_url: 'https://joinascend.com/' + data.slug
    }
  });
}

async function createDeal(data, companyId) {
  const deal = await hubspotRequest('POST', '/crm/v3/objects/deals', {
    properties: {
      dealname: data.name + ' — Partner Page',
      pipeline: PIPELINE_ID,
      dealstage: DEAL_STAGE_MQL,
      description: 'Partner community page created via wizard. Pricing: ' + (data.pricing || 'Standard') + '. Trial: ' + (data.trial || 'Basic free trial') + '.'
    }
  });

  if (companyId) {
    await hubspotRequest('PUT', '/crm/v3/objects/deals/' + deal.id + '/associations/companies/' + companyId + '/deal_to_company', {});
  }

  return deal;
}

async function listPartners() {
  return hubspotRequest('POST', '/crm/v3/objects/companies/search', {
    filterGroups: [{
      filters: [{
        propertyName: 'partner_type',
        operator: 'EQ',
        value: 'partner_community'
      }]
    }],
    properties: ['name', 'domain', 'partner_owner', 'partner_pricing', 'partner_trial', 'partner_benefits', 'partner_page_url'],
    sorts: [{ propertyName: 'name', direction: 'ASCENDING' }],
    limit: 100
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const search = url.searchParams.get('search');

      if (search) {
        const results = await searchCompany(search);
        return sendJson(res, 200, { results: results.results || [] });
      }

      const partners = await listPartners();
      return sendJson(res, 200, { partners: partners.results || [] });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      if (!body || !body.name) {
        return sendJson(res, 400, { error: 'name is required' });
      }

      const existing = await searchCompany(body.name);
      let company;
      let created = false;

      if (existing.total > 0) {
        company = existing.results[0];
      } else {
        company = await createCompany(body);
        created = true;
      }

      const deal = await createDeal(body, company.id);

      return sendJson(res, created ? 201 : 200, {
        company: { id: company.id, name: body.name, created },
        deal: { id: deal.id, name: deal.properties.dealname }
      });
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Partner API error:', err);
    sendJson(res, err.status || 500, {
      error: err.message,
      detail: err.detail || null
    });
  }
};
