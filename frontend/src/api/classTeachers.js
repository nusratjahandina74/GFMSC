import apiClient from './client';

export const getClassTeachers = async (params = {}) => {
  try {
    const response = await apiClient.get('/class-teachers', { params });
    return response.data.classTeachers || [];
  } catch (error) {
    console.error('Error fetching class teachers:', error);
    throw error;
  }
};

export const getClassTeacherById = async (id) => {
  try {
    const response = await apiClient.get(`/class-teachers/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching class teacher:', error);
    throw error;
  }
};

export const createClassTeacher = async (data) => {
  try {
    const response = await apiClient.post('/class-teachers', data);
    return response.data;
  } catch (error) {
    console.error('Error creating class teacher:', error);
    throw error;
  }
};

export const updateClassTeacher = async (id, data) => {
  try {
    const response = await apiClient.put(`/class-teachers/${id}`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating class teacher:', error);
    throw error;
  }
};

export const deleteClassTeacher = async (id) => {
  try {
    const response = await apiClient.delete(`/class-teachers/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting class teacher:', error);
    throw error;
  }
};
