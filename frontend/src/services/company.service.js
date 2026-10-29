import api from './api.js';

export async function listCompanies() {
  const res = await api.get('/companies');
  return res.data.data;
}

/** Powers the company-specific past interview question bank on CompanyDetail */
export async function getCompany(slug) {
  const res = await api.get(`/companies/${slug}`);
  return res.data.data;
}
