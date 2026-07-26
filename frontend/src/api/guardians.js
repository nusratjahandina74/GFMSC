// src/api/guardians.js
import apiClient from './client';

export const getGuardians = async (params = {}) => {
  try {
    const response = await apiClient.get('/guardians', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching guardians:', error);
    throw error;
  }
};

export const getGuardianById = async (id) => {
  try {
    const response = await apiClient.get(`/guardians/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching guardian:', error);
    throw error;
  }
};

export const createGuardian = async (guardianData) => {
  try {
    const response = await apiClient.post('/guardians', guardianData);
    return response.data;
  } catch (error) {
    console.error('Error creating guardian:', error);
    throw error;
  }
};

export const updateGuardian = async (id, guardianData) => {
  try {
    const response = await apiClient.put(`/guardians/${id}`, guardianData);
    return response.data;
  } catch (error) {
    console.error('Error updating guardian:', error);
    throw error;
  }
};

export const deleteGuardian = async (id) => {
  try {
    const response = await apiClient.delete(`/guardians/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting guardian:', error);
    throw error;
  }
};
