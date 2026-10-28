// src/api/students.js
import apiClient from './client';

export const getStudents = async (params = {}) => {
  try {
    const response = await apiClient.get('/students', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching students:', error);
    throw error;
  }
};

export const getStudentById = async (id) => {
  try {
    const response = await apiClient.get(`/students/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching student:', error);
    throw error;
  }
};

export const createStudent = async (studentData) => {
  try {
    const response = await apiClient.post('/students', studentData);
    return response.data;
  } catch (error) {
    console.error('Error creating student:', error);
    throw error;
  }
};

export const updateStudent = async (id, studentData) => {
  try {
    const response = await apiClient.put(`/students/${id}`, studentData);
    return response.data;
  } catch (error) {
    console.error('Error updating student:', error);
    throw error;
  }
};

export const deleteStudent = async (id) => {
  try {
    const response = await apiClient.delete(`/students/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting student:', error);
    throw error;
  }
};

// For dropdown/select options
export const getStudentOptions = async () => {
  try {
    const response = await apiClient.get('/students/options');
    return response.data;
  } catch (error) {
    console.error('Error fetching student options:', error);
    throw error;
  }
};